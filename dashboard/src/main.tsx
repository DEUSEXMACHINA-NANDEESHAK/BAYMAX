import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// NOTE: StrictMode removed — it double-invokes useEffect in dev mode,
// which causes rapid MQTT connect/disconnect cycles that crash FoxMQ's WebSocket.
ReactDOM.createRoot(document.getElementById('root')!).render(<App />)
