import http.server

port = 8000
address = ("",port)
server = http.server.HTTPServer
handler = http.server.CGIHTTPRequestHandler
handler.extensions_map=({
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.mjs': 'text/javascript',
    '': 'application/octet-stream', # Default
    })
httpd = server(address, handler)
httpd.serve_forever()