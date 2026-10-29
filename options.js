document.addEventListener('DOMContentLoaded', function () {
    const elems = document.querySelectorAll('select');
    M.FormSelect.init(elems);

    // Retrieve the previously selected model from storage and set it as the active option if it exists
    chrome.storage.sync.get('defaultModel', function (data) {
        if (data.defaultModel) {
            const modelSelect = document.getElementById('model-select');
            const savedModelIsSupported = [...modelSelect.options]
                .some((option) => option.value === data.defaultModel);
            modelSelect.value = savedModelIsSupported ? data.defaultModel : "gpt-6-luna";
            M.FormSelect.init(modelSelect);
        }
    });
});

document.getElementById("configuration-form").addEventListener("submit", function (event) {
    event.preventDefault();
    const apiKey = document.getElementById("api-key-input").value;
    const defaultModel = document.getElementById("model-select").value;
    chrome.storage.sync.set({
        apiKey: apiKey,
        defaultModel: defaultModel
    }, () => {
        chrome.notifications.create({
            type: 'basic',
            iconUrl: '/icons/64.png',
            title: 'AI Event Scheduler',
            message: `💾 Saved. Current model: ${defaultModel}`,
            priority: 1
        });
    });
});
