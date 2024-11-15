import { buildRequestOpenAI, parseResponseOpenAI } from "./modules/openai.js";
import { buildRequestGemini, parseResponseGemini } from "./modules/gemini.js";
import { GCalLink, iCalDownload, autoSelect } from "./modules/prompts.js";

import { isAllDayEvent } from "./modules/util.js";


const modelHandlers = {
    "gpt-3.5-turbo": { build: buildRequestOpenAI, parse: parseResponseOpenAI },
    "gpt-4o-mini": { build: buildRequestOpenAI, parse: parseResponseOpenAI },
    "gpt-4o": { build: buildRequestOpenAI, parse: parseResponseOpenAI },
    "gemini-pro": { build: buildRequestGemini, parse: parseResponseGemini },
    "gemini-1.5-flash-latest": { build: buildRequestGemini, parse: parseResponseGemini },
};

function buildRequest(request_params, apiKey, model) {
    const handler = modelHandlers[model];
    if (handler) {
        return handler.build(request_params, apiKey, model);
    }
    throw new Error(`Unsupported model: ${model}`);
}

function parseResponse(data, model) {
    const handler = modelHandlers[model];
    if (handler) {
        return handler.parse(data);
    }
    throw new Error(`Unsupported model: ${model}`);
}

chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: "create-gcal-url",
        title: "Create Google Calendar event",
        contexts: ["selection"]
    });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId == "create-gcal-url") {
        console.log(info);
        chrome.storage.sync.get(["apiKey", "defaultModel", "selectedMode"], function (result) {
            chrome.scripting.insertCSS({
                target: { tabId: tab.id },
                css: 'body { cursor: wait; }'
            });
            if (result.apiKey === undefined) {
                chrome.notifications.create({
                    type: 'basic',
                    iconUrl: '/icons/64.png',
                    title: 'AI Event Scheduler',
                    message: "API key is not set. Please set it in the extension options..",
                    priority: 1
                });
                chrome.runtime.openOptionsPage();
            } else {
                const apiKey = result.apiKey;
                let selectedMode = result.selectedMode;
                let model = result.defaultModel;
                if (model === undefined) model = "gpt-3.5-turbo";
                if (selectedMode === undefined) selectedMode = "newTab";

                const selectedText = info.selectionText;
                let request_params;
                if (selectedMode === "newTab") {
                    request_params = GCalLink(selectedText);
                } else if (selectedMode === "ical") {
                    request_params = iCalDownload(selectedText);
                } else if (selectedMode === "auto") {
                    request_params = autoSelect(selectedText);
                }
                console.log(`${info.pageUrl} is creating an event from\n`, selectedText);

                const request = buildRequest(request_params, apiKey, model);
                console.log("Prompt\n", request.options.body);
                fetch(request.endpoint, request.options)
                    .then(response => response.json())
                    .then(data => {

                        if ((data.error?.type === "invalid_request_error") ||
                            (data.error?.details?.[0]?.reason === 'API_KEY_INVALID') ||
                            (data.error?.code === 403)) {
                            throw new Error("Invalid API key");
                        }

                        const parsedResponse = parseResponse(data, model);
                        const { function_used, event } = parsedResponse;

                        if (function_used === "get_event_information") {
                            console.log("get_event_information", event)
                            // Format the dates
                            const startDate = event.start_date;
                            // For untimed events the end date is exclusive, so the end date should be the next day.
                            let endDate = event.end_date;
                            if (isAllDayEvent(endDate)) {
                                endDate = new Date(endDate.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'));
                                endDate.setDate(endDate.getDate() + 1);
                                endDate = endDate.toISOString().split('T')[0].replace(/-/g, '');
                                event.end_date = endDate;
                            } else if (!endDate) {
                                endDate = startDate;
                            }

                            // URL encode the event details
                            const title = encodeURIComponent(event.title);
                            const location = encodeURIComponent(event.location);
                            const description = `${encodeURIComponent(event.description)}
                            <br/><br/><br/>
                            <a href="${encodeURIComponent(info.pageUrl)}">Created from this web page</a>
                            `;


                            // Construct the Google Calendar URL with recurring event information
                            let calendarURL = `https://www.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${startDate}/${endDate}&details=${description}&location=${location}`;

                            // Add recurrence information if available
                            if (event.recurrence) {
                                const recur = event.recurrence;
                                let recurrence = [];

                                if (recur.frequency) recurrence.push(`FREQ=${recur.frequency.toUpperCase()}`);
                                if (recur.interval) recurrence.push(`INTERVAL=${recur.interval}`);
                                if (recur.days && recur.days.length > 0) recurrence.push(`BYDAY=${recur.days.join(',')}`);
                                if (recur.end_date) recurrence.push(`UNTIL=${recur.end_date.replace(/[-]/g, '')}`);

                                if (recurrence.length > 0) {
                                    const rrule = `RRULE:${recurrence.join(';')}`;
                                    calendarURL += `&recur=${encodeURIComponent(rrule)}`;
                                }

                                // Add exceptions if any
                                if (recur.exceptions && recur.exceptions.length > 0) {
                                    const exdates = recur.exceptions.map(date => date.replace(/[-]/g, '')).join(',');
                                    calendarURL += `&recurrence=EXDATE:${exdates}`;
                                }
                            }

                            console.log("Calendar URL:", calendarURL);

                            chrome.tabs.create({
                                url: calendarURL
                            });
                        } else if (function_used === "generate_ical_file") {
                            const icsFile = event.ical;
                            chrome.downloads.download({
                                url: `data:text/calendar,${encodeURIComponent(icsFile)}`,
                                filename: event.filename,
                                saveAs: true
                            });
                        }

                        // CSS rule to set the cursor back to default 
                        chrome.scripting.insertCSS({
                            target: { tabId: tab.id },
                            css: 'body { cursor: default; }'
                        });

                    })
                    .catch(error => {
                        chrome.scripting.insertCSS({
                            target: { tabId: tab.id },
                            css: 'body { cursor: default; }'
                        });
                        if (error.message === "Invalid API key") {
                            chrome.notifications.create({
                                type: 'basic',
                                iconUrl: '/icons/64.png',
                                title: 'AI Event Scheduler',
                                message: "Invalid API key. Please set a valid API key in the extension options.",
                                priority: 1
                            });
                            chrome.runtime.openOptionsPage();
                        } else {
                            console.log(error);
                            chrome.notifications.create({
                                type: 'basic',
                                iconUrl: '/icons/64.png',
                                title: 'AI Event Scheduler',
                                message: "An error occurred while creating the event. Please try again later.",
                                priority: 1
                            });
                        }
                    });
            }
        });
    }
});
