import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { FlagsmithProvider } from '@flagsmith/flagsmith/react'
import { flagsmith, flagsmithOptions, internalMode } from './flagsmith'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* No options in internal-test mode: the SDK is never initialised, so nothing is sent. */}
    <FlagsmithProvider flagsmith={flagsmith} options={internalMode ? undefined : flagsmithOptions}>
      <App />
    </FlagsmithProvider>
  </StrictMode>,
)
