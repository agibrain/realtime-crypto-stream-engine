import { createServer } from 'http';
import { TradingViewScraper } from './scraper';

const scraper = new TradingViewScraper();

interface PriceData {
  ticker: string;
  price: string;
  timestamp: number;
}

// Store active SSE connections
const sseConnections = new Set<any>();

// Set up price update broadcasting
function broadcastPriceUpdate(data: PriceData) {
  console.log(`Broadcasting price update: ${data.ticker} = ${data.price}`);
  const deadConnections = new Set();
  
  sseConnections.forEach(connection => {
    try {
      if (!connection.response.destroyed) {
        connection.response.write(`data: ${JSON.stringify(data)}\n\n`);
      } else {
        deadConnections.add(connection);
      }
    } catch (error) {
      console.error('Error sending price update:', error);
      deadConnections.add(connection);
    }
  });
  
  // Clean up dead connections
  deadConnections.forEach(conn => sseConnections.delete(conn));
}

// Create HTTP server
const server = createServer(async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const url = new URL(req.url || '', `http://${req.headers.host}`);
  
  if (req.method === 'GET' && url.pathname === '/api/tickers') {
    // Get active tickers
    const tickers = scraper.getActiveTickers();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ tickers }));
    return;
  }
  
  if (req.method === 'POST' && url.pathname === '/api/tickers') {
    // Add ticker
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { ticker } = JSON.parse(body);
        console.log(`API: Adding ticker ${ticker}`);
        const success = await scraper.addTicker(ticker.toUpperCase());
        
        if (success) {
          // Set up price update listener for this ticker
          scraper.onPriceUpdate(ticker.toUpperCase(), (data: PriceData) => {
            broadcastPriceUpdate(data);
          });
        }
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          success, 
          message: success ? `Ticker ${ticker} added successfully` : `Failed to add ticker ${ticker}` 
        }));
      } catch (error) {
        console.error('Error parsing add ticker request:', error);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: 'Invalid request' }));
      }
    });
    return;
  }
  
  if (req.method === 'DELETE' && url.pathname.startsWith('/api/tickers/')) {
    // Remove ticker
    const ticker = url.pathname.split('/').pop()?.toUpperCase();
    if (ticker) {
      console.log(`API: Removing ticker ${ticker}`);
      const success = await scraper.removeTicker(ticker);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        success, 
        message: success ? `Ticker ${ticker} removed successfully` : `Ticker ${ticker} not found` 
      }));
    } else {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: 'Invalid ticker' }));
    }
    return;
  }
  
  if (req.method === 'GET' && url.pathname === '/api/prices/stream') {
    // Server-Sent Events for price streaming
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    
    const connection = {
      response: res,
      id: Date.now() + Math.random()
    };
    
    sseConnections.add(connection);
    console.log(`Client connected to price stream (${sseConnections.size} total connections)`);
    
    // Send initial connection confirmation
    res.write('data: {"type":"connected","message":"Price stream connected"}\n\n');
    
    // Clean up when client disconnects
    req.on('close', () => {
      sseConnections.delete(connection);
      console.log(`Client disconnected from price stream (${sseConnections.size} remaining)`);
    });
    
    req.on('error', () => {
      sseConnections.delete(connection);
    });
    
    return;
  }
  
  // 404 for other routes
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

// Initialize and start server
async function startServer() {
  try {
    console.log('Initializing TradingView scraper...');
    await scraper.initialize();
    console.log('Scraper initialized successfully');

    const PORT = process.env.PORT || 8080;

    server.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log('API endpoints:');
      console.log('  GET /api/tickers - Get active tickers');
      console.log('  POST /api/tickers - Add ticker');
      console.log('  DELETE /api/tickers/:ticker - Remove ticker');
      console.log('  GET /api/prices/stream - Price stream (SSE)');
      console.log('');
      console.log('Ready to accept ticker subscriptions!');
    });

    // Graceful shutdown
    const cleanup = async () => {
      console.log('Shutting down server...');
      sseConnections.clear();
      await scraper.cleanup();
      server.close(() => {
        console.log('Server closed');
        process.exit(0);
      });
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();