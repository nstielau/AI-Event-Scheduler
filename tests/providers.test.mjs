import assert from "node:assert/strict";
import test from "node:test";

import { buildRequestGemini, parseResponseGemini } from "../modules/gemini.js";
import { buildRequestOpenAI, parseResponseOpenAI } from "../modules/openai.js";

const getEventInformation = {
    name: "get_event_information",
    description: "Extract event information.",
    parameters: {
        type: "object",
        properties: {
            title: { type: "string" }
        },
        required: ["title"]
    }
};

const requestParams = {
    prompt: "Lunch tomorrow at noon",
    functions: [getEventInformation]
};

test("OpenAI requests use the Responses API function-call format", () => {
    const request = buildRequestOpenAI(requestParams, "test-key", "gpt-6-luna");
    const body = JSON.parse(request.options.body);

    assert.equal(request.endpoint, "https://api.openai.com/v1/responses");
    assert.equal(body.input, requestParams.prompt);
    assert.deepEqual(body.tools, [{
        type: "function",
        name: getEventInformation.name,
        description: getEventInformation.description,
        parameters: getEventInformation.parameters,
        strict: false
    }]);
    assert.deepEqual(body.tool_choice, { type: "function", name: getEventInformation.name });
    assert.deepEqual(body.reasoning, { effort: "none" });
    assert.equal(body.store, false);
});

test("OpenAI uses a supported reasoning effort for GPT-6.1 Sol", () => {
    const request = buildRequestOpenAI(requestParams, "test-key", "gpt-6.1-sol");

    assert.deepEqual(JSON.parse(request.options.body).reasoning, { effort: "low" });
});

test("OpenAI parses a function-call output item", () => {
    const parsed = parseResponseOpenAI({
        output: [{
            type: "function_call",
            name: getEventInformation.name,
            arguments: JSON.stringify({ title: "Lunch" })
        }]
    });

    assert.deepEqual(parsed, {
        function_used: getEventInformation.name,
        event: { title: "Lunch" }
    });
});

test("Gemini request and response adapters retain their contract", () => {
    const request = buildRequestGemini(requestParams, "test-key", "gemini-3.7-flash");
    const body = JSON.parse(request.options.body);
    const parsed = parseResponseGemini({
        candidates: [{
            content: {
                parts: [{
                    functionCall: {
                        name: getEventInformation.name,
                        args: { title: "Lunch" }
                    }
                }]
            }
        }]
    });

    assert.equal(body.contents.parts.text, requestParams.prompt);
    assert.deepEqual(body.tool_config.function_calling_config.allowed_function_names, [getEventInformation.name]);
    assert.deepEqual(parsed, {
        function_used: getEventInformation.name,
        event: { title: "Lunch" }
    });
});
