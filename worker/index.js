export default {
    async fetch(request, environment) {
        if (environment.ASSETS?.fetch) return environment.ASSETS.fetch(request);
        return new Response('The portfolio assets are unavailable.', { status: 503 });
    }
};
