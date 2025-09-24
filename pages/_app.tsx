
import type { AppProps } from 'next/app'
import 'leaflet/dist/leaflet.css'
import '../styles/globals.css'

export default function MyApp({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />
}
