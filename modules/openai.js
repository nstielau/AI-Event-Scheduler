export function buildRequestOpenAI(request_params, apiKey, model) {

    const prompt = request_params.prompt;
    const tools = request_params.functions.map((func) => ({
        "type": "function",
        "name": func.name,
        "description": func.description,
        "parameters": func.parameters,
        "strict": false
    }));

    let tool_choice = "required";
    if (request_params.functions.length === 1) {
        tool_choice = { "type": "function", "name": request_params.functions[0].name };
    }

    const request_body = JSON.stringify({
        model: model,
        input: prompt,
        tools: tools,
        tool_choice: tool_choice,
        reasoning: { effort: model === "gpt-6.1-sol" ? "low" : "none" },
        store: false
    });
    const request = {
        endpoint: "https://api.openai.com/v1/responses",
        options: {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`
            },
            body: request_body
        }
    };

    return request;
}

export function parseResponseOpenAI(data) {

    const functionCall = data.output?.find((item) => item.type === "function_call");
    if (!functionCall) {
        throw new Error("OpenAI did not return a function call");
    }

    const parsedResponse = {
        function_used: functionCall.name,
        event: JSON.parse(functionCall.arguments)
    };

    return parsedResponse;
}
