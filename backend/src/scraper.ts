import { chromium, Browser, Page } from 'playwright';

export interface PriceData {
  ticker: string;
  price: string;
  timestamp: number;
}

export class TradingViewScraper {
  private browser: Browser | null = null;
  private pages: Map<string, Page> = new Map();
  private priceCallbacks: Map<string, Set<(data: PriceData) => void>> = new Map();

  async initialize() {
    console.log('Initializing TradingView scraper...');
    this.browser = await chromium.launch({ 
      headless: false,  // Run in headed mode as required
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--disable-blink-features=AutomationControlled',
        '--start-maximized'  // Start browser maximized for better visibility
      ]
    });
    console.log('Browser launched successfully - will use single browser with multiple tabs');
  }

  async addTicker(ticker: string): Promise<boolean> {
    if (!this.browser) {
      console.error('Browser not initialized');
      return false;
    }

    if (this.pages.has(ticker)) {
      console.log(`Ticker ${ticker} already being monitored`);
      return true;
    }

    try {
      console.log(`Adding ticker: ${ticker} (creating new tab in existing browser)`);
      const page = await this.browser.newPage();
      
      // Set viewport size and page title for better tab identification
      await page.setViewportSize({ width: 1280, height: 720 });
      
      // Navigate to TradingView page for the ticker
      const url = `https://www.tradingview.com/symbols/${ticker}/?exchange=BINANCE`;
      console.log(`Opening new tab for ${ticker}: ${url}`);
      
      await page.goto(url, { waitUntil: 'load', timeout: 30000 });
      
      // Set a recognizable title for the tab
      await page.evaluate((tickerName) => {
        document.title = `${tickerName} - TradingView Price Monitor`;
      }, ticker);
      
      // Wait for page to load properly
      console.log(`Waiting for page to load for ${ticker}...`);
      await page.waitForTimeout(8000);
      
      // Check if we can find price-like content
      const hasContent = await this.waitForPriceContent(page, ticker);
      if (!hasContent) {
        console.error(`Could not find price content for ${ticker}`);
        await page.close();
        return false;
      }
      
      this.pages.set(ticker, page);
      
      // Start monitoring price changes
      await this.startPriceMonitoring(ticker, page);
      
      const totalTabs = this.pages.size;
      console.log(`Successfully added ticker: ${ticker} (Tab ${totalTabs} in browser)`);
      return true;
    } catch (error) {
      console.error(`Failed to add ticker ${ticker}:`, error);
      return false;
    }
  }

  private async waitForPriceContent(page: Page, ticker: string): Promise<boolean> {
    console.log(`Waiting for price content for ${ticker}...`);
    
    try {
      // Wait for any price-like content to appear
      await page.waitForFunction(() => {
        const text = document.body.textContent || '';
        // Look for price patterns: numbers with 2-8 decimal places
        return /\d{1,6}(?:,\d{3})*\.\d{2,8}/.test(text) || 
               /\d{1,6}(?:,\d{3})*/.test(text);
      }, { timeout: 15000 });
      
      console.log(`Price content found for ${ticker}`);
      return true;
    } catch (error) {
      console.error(`Timeout waiting for price content for ${ticker}`);
      return false;
    }
  }

  async removeTicker(ticker: string): Promise<boolean> {
    const page = this.pages.get(ticker);
    if (!page) {
      console.log(`Ticker ${ticker} not found`);
      return false;
    }

    try {
      console.log(`Removing ticker: ${ticker} (closing tab)`);
      await page.close();
      this.pages.delete(ticker);
      this.priceCallbacks.delete(ticker);
      const remainingTabs = this.pages.size;
      console.log(`Successfully removed ticker: ${ticker} (${remainingTabs} tabs remaining)`);
      return true;
    } catch (error) {
      console.error(`Failed to remove ticker ${ticker}:`, error);
      return false;
    }
  }

  private async startPriceMonitoring(ticker: string, page: Page) {
    console.log(`Starting price monitoring for ${ticker}`);
    
    // Function to extract current price using multiple strategies
    const extractPrice = async (): Promise<string | null> => {
      try {
        // Strategy 1: Try common TradingView selectors
        const commonSelectors = [
          '[data-field="last_price"]',
          '.tv-symbol-price-quote__value',
          '.js-symbol-last',
          '[class*="price"]:not([class*="change"])',
          '[class*="Price"]:not([class*="Change"])',
          '.tradingview-widget-container [class*="price"]'
        ];
        
        for (const selector of commonSelectors) {
          try {
            const element = await page.$(selector);
            if (element) {
              const text = await element.textContent();
              if (text) {
                const price = this.cleanPrice(text);
                if (price && this.isValidPrice(price)) {
                  console.log(`Found price using selector ${selector}: ${price}`);
                  return price;
                }
              }
            }
          } catch (e) {
            // Continue to next selector
          }
        }
        
        // Strategy 2: Look for the largest/most prominent price-like number
        const price = await page.evaluate(() => {
          const elements = Array.from(document.querySelectorAll('*'));
          const candidates: { element: Element; price: number; score: number }[] = [];
          
          for (const el of elements) {
            const text = el.textContent?.trim() || '';
            const rect = el.getBoundingClientRect();
            
            // Skip invisible elements
            if (rect.width === 0 || rect.height === 0) continue;
            
            // Look for price-like patterns
            const priceMatch = text.match(/^\$?(\d{1,6}(?:,\d{3})*(?:\.\d{2,8})?)$/);
            if (priceMatch) {
              const price = parseFloat(priceMatch[1].replace(/,/g, ''));
              
              // Reasonable price range for crypto
              if (price > 0.001 && price < 1000000) {
                const fontSize = parseInt(window.getComputedStyle(el).fontSize) || 12;
                const area = rect.width * rect.height;
                const score = fontSize * Math.sqrt(area);
                
                candidates.push({ element: el, price, score });
              }
            }
          }
          
          // Return the highest scoring candidate
          if (candidates.length > 0) {
            candidates.sort((a, b) => b.score - a.score);
            return candidates[0].price.toString();
          }
          
          return null;
        });
        
        if (price && this.isValidPrice(price)) {
          console.log(`Found price using evaluation strategy: ${price}`);
          return price;
        }
        
        // Strategy 3: Look for any reasonable price in the page text
        const fallbackPrice = await page.evaluate(() => {
          const text = document.body.textContent || '';
          const matches = text.match(/\b(\d{1,6}(?:,\d{3})*(?:\.\d{2,8})?)\b/g);
          
          if (matches) {
            for (const match of matches) {
              const price = parseFloat(match.replace(/,/g, ''));
              if (price > 0.001 && price < 1000000) {
                return match;
              }
            }
          }
          return null;
        });
        
        if (fallbackPrice && this.isValidPrice(fallbackPrice)) {
          console.log(`Found price using fallback strategy: ${fallbackPrice}`);
          return fallbackPrice;
        }
        
        return null;
      } catch (error) {
        console.error(`Error extracting price for ${ticker}:`, error);
        return null;
      }
    };

    // Initial price extraction with retries
    let lastPrice: string | null = null;
    let retries = 0;
    const maxRetries = 5;
    
    while (!lastPrice && retries < maxRetries) {
      console.log(`Attempting to extract price for ${ticker} (attempt ${retries + 1}/${maxRetries})`);
      lastPrice = await extractPrice();
      
      if (!lastPrice) {
        retries++;
        await page.waitForTimeout(3000);
      }
    }
    
    if (lastPrice) {
      this.notifyPriceUpdate({
        ticker,
        price: lastPrice,
        timestamp: Date.now()
      });
    } else {
      console.warn(`Could not extract initial price for ${ticker} after ${maxRetries} attempts`);
    }

    // Set up periodic price checking (every 3 seconds)
    const interval = setInterval(async () => {
      try {
        const currentPrice = await extractPrice();
        if (currentPrice && currentPrice !== lastPrice) {
          lastPrice = currentPrice;
          this.notifyPriceUpdate({
            ticker,
            price: currentPrice,
            timestamp: Date.now()
          });
        }
      } catch (error) {
        console.error(`Error monitoring price for ${ticker}:`, error);
      }
    }, 3000);

    // Clean up interval when page is closed
    page.on('close', () => {
      clearInterval(interval);
    });
  }

  private cleanPrice(text: string): string | null {
    if (!text) return null;
    
    // Remove currency symbols and clean the text
    const cleaned = text.trim().replace(/[$€£¥₹]/g, '').replace(/[^\d.,]/g, '');
    
    // Handle different decimal separators
    if (cleaned.includes(',') && cleaned.includes('.')) {
      // Assume comma is thousands separator
      return cleaned.replace(/,/g, '');
    } else if (cleaned.includes(',')) {
      // Could be decimal separator in some locales, but assume thousands for now
      return cleaned.replace(/,/g, '');
    }
    
    return cleaned;
  }

  private isValidPrice(price: string): boolean {
    const num = parseFloat(price);
    return !isNaN(num) && num > 0.001 && num < 1000000;
  }

  onPriceUpdate(ticker: string, callback: (data: PriceData) => void) {
    if (!this.priceCallbacks.has(ticker)) {
      this.priceCallbacks.set(ticker, new Set());
    }
    this.priceCallbacks.get(ticker)!.add(callback);
  }

  offPriceUpdate(ticker: string, callback: (data: PriceData) => void) {
    const callbacks = this.priceCallbacks.get(ticker);
    if (callbacks) {
      callbacks.delete(callback);
      if (callbacks.size === 0) {
        this.priceCallbacks.delete(ticker);
      }
    }
  }

  private notifyPriceUpdate(data: PriceData) {
    console.log(`Price update: ${data.ticker} = ${data.price}`);
    const callbacks = this.priceCallbacks.get(data.ticker);
    if (callbacks) {
      callbacks.forEach(callback => callback(data));
    }
  }

  getActiveTickers(): string[] {
    return Array.from(this.pages.keys()).sort();
  }

  async cleanup() {
    console.log('Cleaning up scraper...');
    for (const [ticker, page] of this.pages) {
      try {
        await page.close();
      } catch (error) {
        console.error(`Error closing page for ${ticker}:`, error);
      }
    }
    this.pages.clear();
    this.priceCallbacks.clear();
    
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
    console.log('Scraper cleanup completed');
  }
}