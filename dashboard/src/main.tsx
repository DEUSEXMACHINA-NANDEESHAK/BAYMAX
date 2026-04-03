import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// StrictMode removed to prevent MQTT double-connect
ReactDOM.createRoot(document.getElementById('root')!).render(<App />)
