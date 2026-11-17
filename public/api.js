// Alias loader for /api.js -> /js/api.js
const script = document.createElement('script');
script.src = '/js/api.js';
document.head.appendChild(script);
