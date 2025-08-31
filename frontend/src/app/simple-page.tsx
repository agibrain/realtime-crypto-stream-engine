'use client';

import { useState, useEffect } from 'react';

interface PriceData {
  ticker: string;
  price: string;
  timestamp: number;
}

export default function SimplePage() {
  const [tickers, setTickers] = useState<string[]>([]);
  const [prices, setPrices] = useState<Map<string, PriceData>>(new Map());
  const [newTicker, setNewTicker] = useState('');

  const API_BASE = 'http://localhost:8080/api';

  // Load existing tickers on component mount
  useEffect(() => {
    loadTickers();
    startPriceStream();
  }, []);

  const loadTickers = async () => {
    try {
      const response = await fetch(`${API_BASE}/tickers`);
      const data = await response.json();
      const sortedTickers = data.tickers.sort();
      setTickers(sortedTickers);
    } catch (error) {
      console.error('Error loading tickers:', error);
    }
  };

  const startPriceStream = () => {
    try {
      const eventSource = new EventSource(`${API_BASE}/prices/stream`);
      
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'connected') {
            return;
          }
          
          if (data.ticker && data.price) {
            const priceData: PriceData = {
              ticker: data.ticker,
              price: data.price,
              timestamp: data.timestamp || Date.now(),
            };
            
            setPrices(prev => new Map(prev.set(data.ticker, priceData)));
          }
        } catch (err) {
          console.error('Error parsing price update:', err);
        }
      };
      
      eventSource.onerror = (error) => {
        console.error('Price stream error:', error);
        eventSource.close();
        
        // Retry connection after 5 seconds
        setTimeout(startPriceStream, 5000);
      };
      
    } catch (error) {
      console.error('Error starting price stream:', error);
    }
  };

  const handleAddTicker = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTicker.trim()) return;

    const ticker = newTicker.trim().toUpperCase();
    
    try {
      const response = await fetch(`${API_BASE}/tickers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker }),
      });
      
      const data = await response.json();
      if (data.success) {
        setTickers(prev => [...prev.filter(t => t !== ticker), ticker].sort());
        setNewTicker('');
      }
    } catch (error) {
      console.error('Error adding ticker:', error);
    }
  };

  const handleRemoveTicker = async (ticker: string) => {
    try {
      const response = await fetch(`${API_BASE}/tickers/${ticker}`, {
        method: 'DELETE',
      });
      
      const data = await response.json();
      if (data.success) {
        setTickers(prev => prev.filter(t => t !== ticker));
        setPrices(prev => {
          const newPrices = new Map(prev);
          newPrices.delete(ticker);
          return newPrices;
        });
      }
    } catch (error) {
      console.error('Error removing ticker:', error);
    }
  };

  const formatPrice = (price: string) => {
    const numPrice = parseFloat(price);
    return isNaN(numPrice) ? price : numPrice.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  return (
    <div style={{ 
      padding: '20px', 
      fontFamily: 'Arial, sans-serif',
      maxWidth: '600px',
      margin: '0 auto'
    }}>
      {/* Add Ticker Form */}
      <form onSubmit={handleAddTicker} style={{ marginBottom: '20px' }}>
        <div style={{ 
          display: 'flex', 
          gap: '0', 
          backgroundColor: '#f5f5f5',
          borderRadius: '4px',
          overflow: 'hidden'
        }}>
          <input
            type="text"
            value={newTicker}
            onChange={(e) => setNewTicker(e.target.value)}
            placeholder="Ticker"
            style={{
              flex: 1,
              padding: '12px 16px',
              border: 'none',
              backgroundColor: '#f5f5f5',
              fontSize: '16px',
              outline: 'none'
            }}
          />
          <button
            type="submit"
            style={{
              padding: '12px 20px',
              backgroundColor: '#000',
              color: 'white',
              border: 'none',
              cursor: 'pointer',
              fontSize: '16px',
              fontWeight: '500'
            }}
          >
            Add
          </button>
        </div>
      </form>

      {/* Tickers List */}
      <div style={{ display: 'grid', gap: '8px' }}>
        {tickers.map((ticker) => {
          const priceData = prices.get(ticker);
          return (
            <div
              key={ticker}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '16px 20px',
                backgroundColor: '#f5f5f5',
                borderRadius: '4px'
              }}
            >
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                width: '100%',
                marginRight: '16px'
              }}>
                <span style={{ 
                  fontSize: '16px', 
                  fontWeight: '600',
                  color: '#333'
                }}>
                  {ticker}
                </span>
                <span style={{ 
                  fontSize: '16px', 
                  fontWeight: '600',
                  color: '#333'
                }}>
                  {priceData ? formatPrice(priceData.price) : '...'}
                </span>
              </div>
              <button
                onClick={() => handleRemoveTicker(ticker)}
                style={{
                  width: '24px',
                  height: '24px',
                  backgroundColor: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '18px',
                  color: '#666',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '50%'
                }}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
