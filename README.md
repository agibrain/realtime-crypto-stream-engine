# Project Pluto - Fullstack Realtime Crypto Price Tracker



## Task
built a full-stack web application that streams real-time cryptocurrency prices from https://tradingview.com. The application will consist of a Node.js backend and a Next.js frontend.

A demonstration of the expected functionality is available in the video file `demo.gif` file in this repository.

## Tech Stack
*   TypeScript
*   Next.js
*   Node.js
    *   `tsx` for TypeScript execution
*   `pnpm` for package management (do not use `npm`)
*   ConnectRPC for communication between the frontend and backend
*   Playwright to stream price data from TradingView via the Node.js server


## Requirements

#### Data Streaming
*   Stream live cryptocurrency prices directly from TradingView using Playwright.
*   Target URLs follow the format: `https://www.tradingview.com/symbols/{ticker}/?exchange=BINANCE`.
    *   The `{ticker}` variable represents a valid cryptocurrency symbol (e.g., BTCUSD, ETHUSD, SOLUSD). A complete list of tickers is available at https://www.tradingview.com/markets/cryptocurrencies/prices-all/
    *   For implementation simplicity, the `exchange` is standardized to BINANCE.
