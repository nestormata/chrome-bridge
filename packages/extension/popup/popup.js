const tokenInput = document.getElementById('token')
const portInput = document.getElementById('port')
const saveBtn = document.getElementById('save')
const clearBtn = document.getElementById('clear')
const statusEl = document.getElementById('status')

function showStatus(msg, ok) {
  statusEl.textContent = msg
  statusEl.className = `status ${ok ? 'ok' : 'err'}`
}

// Load saved values on popup open
chrome.storage.local.get(['relayToken', 'relayPort'], ({ relayToken, relayPort }) => {
  if (relayToken) tokenInput.value = relayToken
  if (relayPort)  portInput.value = relayPort
})

saveBtn.addEventListener('click', async () => {
  const token = tokenInput.value.trim()
  const port = parseInt(portInput.value, 10)

  if (!token) return showStatus('Token is required', false)
  if (!port || port < 1024 || port > 65535) return showStatus('Invalid port', false)

  await chrome.storage.local.set({ relayToken: token, relayPort: port })
  // Notify background to reconnect
  await chrome.runtime.sendMessage({ type: 'reconnect' }).catch(() => {})
  showStatus('Saved — connecting to relay…', true)
})

clearBtn.addEventListener('click', async () => {
  await chrome.storage.local.remove(['relayToken', 'relayPort'])
  tokenInput.value = ''
  portInput.value = '9876'
  showStatus('Disconnected and token cleared', true)
})
