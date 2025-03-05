// Fix for extractContext function - with debugging
(function() {
    console.log("Context fix script running");
    
    // Define extractContext globally
    window.extractContext = window.extractContext || function(context, key, defaultValue = null) {
        console.log("Using polyfilled extractContext function");
        if (!context || typeof context !== 'object') return defaultValue;
        if (key in context) return context[key];
        return defaultValue;
    };
    
    // Also define it with capital E for possible capitalization issues
    window.ExtractContext = window.extractContext;
    
    // Monitor for errors
    window.addEventListener('error', function(event) {
        if (event.message && event.message.includes('extractContext')) {
            console.error("extractContext error detected:", event.message);
            console.error("Stack:", event.error ? event.error.stack : "No stack available");
        }
    });
    
    console.log("Context fix completed. extractContext is", typeof window.extractContext);
})();
