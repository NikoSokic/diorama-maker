import { useEffect, useState } from 'react'

export function HealthStatus() {
  const [status, setStatus] = useState('provjeravam…')

  useEffect(() => {
    const controller = new AbortController()

    fetch('/api/health', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }
        const body: { status: string } = await response.json()
        setStatus(body.status)
      })
      .catch((error: Error) => {
        if (error.name !== 'AbortError') {
          setStatus(`greška (${error.message})`)
        }
      })

    return () => controller.abort()
  }, [])

  return <div className="health-status">API: {status}</div>
}
