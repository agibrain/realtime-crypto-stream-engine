import { createConnectRouter } from '@connectrpc/connect';
import { createServer } from 'http';
import { connectNodeAdapter } from '@connectrpc/connect-node';
import { CryptoPriceService } from './gen/crypto_price_connect';
import {
  StreamPricesRequest,
  PriceUpdate,
  AddTickerRequest,
  AddTickerResponse,
  RemoveTickerRequest,
  RemoveTickerResponse,
  GetTickersRequest,
  GetTickersResponse,
} from './gen/crypto_price_pb';
import { TradingViewScraper } from './scraper';
import { create } from '@bufbuild/protobuf';

const scraper = new TradingViewScraper();

// Create ConnectRPC router
const router = createConnectRouter({
  service: CryptoPriceService,
  routes: {
    async *streamPrices(req: StreamPricesRequest) {
      console.log('Client connected to price stream');
      
      try {
        // Set up price update handler
        const priceUpdateHandler = (data: any) => {
          const update = create(PriceUpdate, {
            ticker: data.ticker,
            price: data.price,
            timestamp: BigInt(data.timestamp),
          });
          return update;
        };

        // Set up listeners for existing tickers
        const activeTickers = scraper.getActiveTickers();
        console.log(`Setting up stream for ${activeTickers.length} active tickers`);
        
        // Create a queue for price updates
        const updateQueue: PriceUpdate[] = [];
        
        // Set up price listeners for all active tickers
        activeTickers.forEach(ticker => {
          scraper.onPriceUpdate(ticker, (data) => {
            const update = create(PriceUpdate, {
              ticker: data.ticker,
              price: data.price,
              timestamp: BigInt(data.timestamp),
            });
            updateQueue.push(update);
          });
        });

        // Stream updates to client
        while (true) {
          // Check for new updates in the queue
          if (updateQueue.length > 0) {
            const update = updateQueue.shift()!;
            yield update;
          }
          
          // Small delay to prevent busy waiting
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
      } catch (error) {
        console.error('Error in price stream:', error);
        throw error;
      }
    },

    async addTicker(req: AddTickerRequest): Promise<AddTickerResponse> {
      const ticker = req.ticker.toUpperCase();
      console.log(`Request to add ticker: ${ticker}`);
      
      try {
        const success = await scraper.addTicker(ticker);
        return create(AddTickerResponse, {
          success,
          message: success ? `Ticker ${ticker} added successfully` : `Failed to add ticker ${ticker}`
        });
      } catch (error) {
        console.error(`Error adding ticker ${ticker}:`, error);
        return create(AddTickerResponse, {
          success: false,
          message: `Error adding ticker ${ticker}: ${error}`
        });
      }
    },

    async removeTicker(req: RemoveTickerRequest): Promise<RemoveTickerResponse> {
      const ticker = req.ticker.toUpperCase();
      console.log(`Request to remove ticker: ${ticker}`);
      
      try {
        const success = await scraper.removeTicker(ticker);
        return create(RemoveTickerResponse, {
          success,
          message: success ? `Ticker ${ticker} removed successfully` : `Ticker ${ticker} not found`
        });
      } catch (error) {
        console.error(`Error removing ticker ${ticker}:`, error);
        return create(RemoveTickerResponse, {
          success: false,
          message: `Error removing ticker ${ticker}: ${error}`
        });
      }
    },

    async getTickers(req: GetTickersRequest): Promise<GetTickersResponse> {
      console.log('Request to get active tickers');
      const tickers = scraper.getActiveTickers();
      return create(GetTickersResponse, {
        tickers
      });
    }
  }
});

// Initialize and start server
async function startServer() {
  try {
    console.log('Initializing TradingView scraper...');
    await scraper.initialize();
    console.log('Scraper initialized successfully');

    // Create HTTP server with CORS support
    const server = createServer((req, res) => {
      // Enable CORS for all origins
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Connect-Protocol-Version, Connect-Timeout-Ms');
      
      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      // Handle ConnectRPC requests
      connectNodeAdapter({
        routes: router,
      })(req, res);
    });

    const PORT = process.env.PORT || 8080;

    server.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log('Ready to accept ticker subscriptions');
    });

    // Graceful shutdown
    const cleanup = async () => {
      console.log('Shutting down server...');
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