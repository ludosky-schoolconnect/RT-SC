/**
 * RT-SC · Entry point.
 *
 * Mounts the app inside <div id="root">.
 * Wires up:
 *   - Global styles (tokens + base + Tailwind)
 *   - React Query with mobile-friendly defaults
 *   - React Router (BrowserRouter)
 */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import App from './App'
import './styles/tokens.css'
import './styles/base.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Don't refetch if data is younger than 1 minute
      staleTime: 60_000,
      // Keep unused query data in memory for 10 minutes
      gcTime: 10 * 60_000,
      // Mobile browsers fire focus/blur very aggressively — disable refetch on focus
      refetchOnWindowFocus: false,
      // Respect staleTime on remount (don't refetch if cache is fresh)
      refetchOnMount: false,
      // Limited retries — Firestore failures are usually permanent (rules / offline)
      retry: 2,
    },
    mutations: {
      retry: 0,
    },
  },
})

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('#root element not found in index.html')

createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>
)
