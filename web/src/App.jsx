import { useEffect, useRef, useState } from 'react';

const suggestions = [
  { label: 'Chicken recipes', message: 'chicken recipes' },
  { label: 'Asian food in Royapettah', message: 'asian food in royapettah' },
  { label: 'Plan my Saturday', message: 'plan my saturday' },
];

function StateSpinner() {
  return <span className="state-spinner" aria-hidden="true" />;
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d="M16 21V5m0 0-6 6m6-6 6 6M6 19v7h20v-7" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m4 12 16-8-5 16-3.5-7.5L4 12Z" />
      <path d="m11.5 12.5 4-4" />
    </svg>
  );
}

function getItemPlace(item) {
  return [item.place, item.area].filter(Boolean).join(' · ');
}

function createMessageId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function readResponse(response) {
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error('The server returned an unreadable response.');
  }
  if (!response.ok) throw new Error(body.error || 'The request could not be completed.');
  return body;
}

function ItemCard({ item }) {
  return (
    <article className="item-card">
      <div className="item-card__topline">
        <span className={`category-mark category-mark--${item.category || 'other'}`} aria-hidden="true" />
        <span className="item-card__category">{item.category || 'saved'}</span>
        {item.confidence && <span className="item-card__confidence">{item.confidence} confidence</span>}
      </div>
      <h3>{item.title || 'Untitled item'}</h3>
      {getItemPlace(item) && <p className="item-card__place">{getItemPlace(item)}</p>}
      {item.key_points?.length > 0 && <p className="item-card__detail">{item.key_points[0]}</p>}
      {item.tags?.length > 0 && (
        <div className="tag-list" aria-label="Topics">
          {item.tags.slice(0, 3).map((tag) => <span key={tag}>{tag}</span>)}
        </div>
      )}
      {item.source_note && <p className="item-card__source">{item.source_note}</p>}
    </article>
  );
}

function App() {
  const fileInputRef = useRef(null);
  const chatEndRef = useRef(null);
  const uploadInFlightRef = useRef(false);
  const chatInFlightRef = useRef(false);
  const planInFlightRef = useRef(false);
  const itemsInFlightRef = useRef(false);
  const [items, setItems] = useState([]);
  const [itemsState, setItemsState] = useState('loading');
  const [itemsError, setItemsError] = useState('');
  const [uploadState, setUploadState] = useState('idle');
  const [uploadMessage, setUploadMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState('');
  const [planState, setPlanState] = useState('idle');
  const [planTimeline, setPlanTimeline] = useState([]);
  const [planMessage, setPlanMessage] = useState('');
  const [toolEvents, setToolEvents] = useState([]);
  const [feedConnected, setFeedConnected] = useState(false);

  async function loadItems() {
    if (itemsInFlightRef.current) return;
    itemsInFlightRef.current = true;
    setItemsState('loading');
    setItemsError('');
    try {
      const response = await fetch('/api/items');
      const data = await readResponse(response);
      if (!Array.isArray(data)) throw new Error('Saved items could not be loaded.');
      setItems(data);
      setItemsState('ready');
    } catch (error) {
      setItemsError(error instanceof TypeError
        ? 'Saved items could not be reached. Check your connection and try again.'
        : error.message);
      setItemsState('error');
    } finally {
      itemsInFlightRef.current = false;
    }
  }

  useEffect(() => {
    loadItems();

    const source = new EventSource('/api/events');
    source.onopen = () => setFeedConnected(true);
    source.onerror = () => setFeedConnected(false);
    source.onmessage = (event) => {
      try {
        const update = JSON.parse(event.data);
        if (!update.id || !update.tool || !update.status) return;
        setToolEvents((current) => {
          const existing = current.some((entry) => entry.id === update.id);
          const next = existing
            ? current.map((entry) => entry.id === update.id ? update : entry)
            : [update, ...current];
          return next.slice(0, 8);
        });
      } catch {
        setFeedConnected(false);
      }
    };
    return () => source.close();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [messages, chatLoading]);

  async function uploadImage(event) {
    const image = event.target.files?.[0];
    event.target.value = '';
    setUploadMessage('');
    if (!image || uploadInFlightRef.current) return;
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(image.type)) {
      setUploadState('error');
      setUploadMessage('Choose a JPEG, PNG, or WebP screenshot.');
      return;
    }
    if (image.size > 8 * 1024 * 1024) {
      setUploadState('error');
      setUploadMessage('That image is over 8 MB. Choose a smaller screenshot.');
      return;
    }

    uploadInFlightRef.current = true;
    setUploadState('loading');
    const formData = new FormData();
    formData.append('image', image);
    try {
      const response = await fetch('/api/upload', { method: 'POST', body: formData });
      const item = await readResponse(response);
      setItems((current) => [item, ...current.filter((saved) => saved.id !== item.id)]);
      setItemsState('ready');
      setUploadState('success');
      setUploadMessage('Saved to your memory.');
    } catch (error) {
      setUploadState('error');
      setUploadMessage(error instanceof TypeError
        ? 'The upload could not reach the server. Check your connection and try again.'
        : error.message);
    } finally {
      uploadInFlightRef.current = false;
    }
  }

  async function sendMessage(message = chatInput) {
    const prompt = message.trim();
    if (!prompt || chatInFlightRef.current) return;
    chatInFlightRef.current = true;
    setChatInput('');
    setChatError('');
    setMessages((current) => [...current, { id: createMessageId(), role: 'user', text: prompt }]);
    setChatLoading(true);
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt }),
      });
      const result = await readResponse(response);
      if (typeof result.answer !== 'string') throw new Error('The assistant returned no answer.');
      setMessages((current) => [...current, { id: createMessageId(), role: 'assistant', text: result.answer }]);
    } catch (error) {
      setChatError(error instanceof TypeError
        ? 'Mem<3ry could not reach the server. Check your connection and try again.'
        : error.message);
    } finally {
      chatInFlightRef.current = false;
      setChatLoading(false);
    }
  }

  async function planWeekend() {
    if (planInFlightRef.current) return;
    planInFlightRef.current = true;
    setPlanState('loading');
    setPlanTimeline([]);
    setPlanMessage('');

    try {
      const response = await fetch('/api/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const result = await readResponse(response);
      if (!Array.isArray(result.timeline)) {
        throw new Error('The weekend plan could not be read. Please try again.');
      }
      setPlanTimeline(result.timeline);
      setPlanMessage(result.message || 'No saved items are ready for a plan yet. Save a few more reels and try again.');
      setPlanState(result.timeline.length ? 'ready' : 'empty');
    } catch (error) {
      setPlanMessage(error instanceof TypeError
        ? 'The planner could not reach the server. Check your connection and try again.'
        : error.message);
      setPlanState('error');
    } finally {
      planInFlightRef.current = false;
    }
  }

  function submitChat(event) {
    event.preventDefault();
    sendMessage();
  }

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="wordmark" href="#top" aria-label="Mem<3ry home">
          {"Mem<3ry"}<span className="wordmark__dot">.</span>
        </a>
        <nav className="site-nav" aria-label="Main navigation">
          <a href="#saved">Saved</a>
          <a href="#ask">Ask</a>
          <a href="#feed">Tool feed</a>
        </nav>
        <a className="header-action" href="#upload">Add a reel <span aria-hidden="true">+</span></a>
      </header>

      <main id="top" className="page-frame">
        <section className="intro">
          <div className="intro__copy">
            <p className="eyebrow"><span className="live-dot" /> Your saved reels, finally remembered.</p>
            <h1>A little memory for all those <span>“save for later”</span> moments.</h1>
            <p className="intro__note">Drop in a screenshot. Find it again when you need it.</p>
          </div>
          <div className="memory-count" aria-live="polite">
            <span className="memory-count__number">{itemsState === 'ready' ? items.length : '...'}</span>
            <span className="memory-count__label">saved memories</span>
          </div>
        </section>

        <div className="workbench">
          <div className="workbench__left">
            <section id="upload" className="panel upload-panel" aria-labelledby="upload-title">
              <div className="panel-heading">
                <div>
                  <p className="section-kicker">01 / SAVE</p>
                  <h2 id="upload-title">Keep the good ones.</h2>
                </div>
                <span className="panel-index">01</span>
              </div>
              <label
                className={`upload-target ${uploadState === 'loading' ? 'is-loading' : ''} ${uploadState === 'error' ? 'is-error' : ''} ${uploadState === 'success' ? 'is-success' : ''}`}
                htmlFor="screenshot-upload"
                aria-busy={uploadState === 'loading'}
              >
                <span className="upload-target__icon"><UploadIcon /></span>
                <span className="upload-target__title">
                  {uploadState === 'loading' && <StateSpinner />}
                  {uploadState === 'loading' ? 'Reading your screenshot...' : 'Choose a screenshot'}
                </span>
                <span className="upload-target__hint">JPEG, PNG, or WebP · up to 8 MB</span>
                <input
                  ref={fileInputRef}
                  id="screenshot-upload"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={uploadImage}
                  disabled={uploadState === 'loading'}
                />
              </label>
              <p className={`status-line status-line--${uploadState}`} role={uploadState === 'error' ? 'alert' : 'status'} aria-live={uploadState === 'error' ? 'assertive' : 'polite'}>
                {uploadMessage || 'Pick from your camera roll or files.'}
              </p>
            </section>

            <section id="feed" className="panel feed-panel" aria-labelledby="feed-title">
              <div className="panel-heading panel-heading--compact">
                <div>
                  <p className="section-kicker">LIVE / MCP</p>
                  <h2 id="feed-title">Little things happening.</h2>
                </div>
                <span className={`connection-state ${feedConnected ? 'is-connected' : ''}`}>
                  <span />{feedConnected ? 'Live' : 'Reconnecting'}
                </span>
              </div>
              {toolEvents.length === 0 ? (
                <p className="feed-empty">Your tool calls will show up here as they happen.</p>
              ) : (
                <ol className="event-list" aria-live="polite">
                  {toolEvents.map((event) => (
                    <li className="event-row" key={event.id}>
                      <span className={`event-status event-status--${event.status}`} aria-hidden="true" />
                      <div className="event-row__content">
                        <div className="event-row__title">
                          <strong>{event.tool}</strong>
                          <span>{event.status}</span>
                        </div>
                        <p>{event.summary}</p>
                      </div>
                      {event.status !== 'pending' && <time>{event.durationMs} ms</time>}
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>

          <div className="workbench__right">
            <section id="ask" className="panel chat-panel" aria-labelledby="chat-title">
              <div className="panel-heading">
                <div>
                  <p className="section-kicker">02 / REMEMBER</p>
                  <h2 id="chat-title">Ask your saved reels.</h2>
                </div>
                <span className="chat-spark" aria-hidden="true">?</span>
              </div>
              <p className="chat-intro">English or Tanglish, both feel at home here.</p>
              <div className="suggestion-list" aria-label="Try a question">
                {suggestions.map((suggestion) => (
                  <button
                    className="suggestion"
                    key={suggestion.message}
                    type="button"
                    onClick={() => sendMessage(suggestion.message)}
                    disabled={chatLoading}
                  >
                    {suggestion.label}<span aria-hidden="true">↗</span>
                  </button>
                ))}
              </div>
              <div className="planner">
                <button
                  className="planner-button"
                  type="button"
                  onClick={planWeekend}
                  disabled={planState === 'loading'}
                  aria-describedby="planner-status"
                >
                  {planState === 'loading' && <StateSpinner />}
                  {planState === 'loading' ? 'Planning your weekend...' : 'Plan my weekend'}
                </button>
                <div
                  id="planner-status"
                  className={`planner-result planner-result--${planState}`}
                  role={planState === 'error' ? 'alert' : 'status'}
                  aria-live={planState === 'error' ? 'assertive' : 'polite'}
                  aria-busy={planState === 'loading'}
                >
                  {planState === 'loading' && <span className="planner-loading"><StateSpinner /> Finding a few saved plans...</span>}
                  {planState === 'empty' && <p>{planMessage}</p>}
                  {planState === 'error' && <p>{planMessage}</p>}
                  {planState === 'ready' && (
                    <ol className="planner-timeline" aria-label="Weekend timeline">
                      {planTimeline.map(({ time, item }, index) => (
                        <li className="planner-stop" key={`${item.id || item.title}-${index}`}>
                          <time>{time}</time>
                          <div className="planner-stop__content">
                            <strong>{item.title || 'Saved item'}</strong>
                            <span>
                              {[item.category, item.place, item.area].filter(Boolean).join(' · ')}
                            </span>
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              </div>
              <div className="conversation" aria-live="polite" aria-label="Conversation" aria-busy={chatLoading}>
                {messages.length === 0 && (
                  <div className="conversation-empty">
                    <span className="conversation-empty__orb" aria-hidden="true" />
                    <p>Ask about a place, a recipe, or what to do this weekend.</p>
                  </div>
                )}
                {messages.map((message) => (
                  <div className={`chat-message chat-message--${message.role}`} key={message.id}>
                    <span>{message.role === 'user' ? 'You' : <>{"Mem<3ry"}</>}</span>
                    <p>{message.text}</p>
                  </div>
                ))}
                {chatLoading && (
                  <div className="chat-message chat-message--assistant chat-message--loading" role="status">
                    <span>{"Mem<3ry"}</span><p><StateSpinner />Looking through your saved reels...</p>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
              {chatError && <p id="chat-error" className="error-note" role="alert">{chatError}</p>}
              <form className="chat-form" onSubmit={submitChat}>
                <label className="visually-hidden" htmlFor="chat-input">Ask in English or Tanglish</label>
                <input
                  id="chat-input"
                  value={chatInput}
                  onChange={(event) => setChatInput(event.target.value)}
                  placeholder="Try “Velachery la cafe”…"
                  disabled={chatLoading}
                  aria-invalid={Boolean(chatError)}
                  aria-describedby={chatError ? 'chat-error' : undefined}
                />
                <button
                  className="send-button"
                  type="submit"
                  aria-label="Send message"
                  disabled={chatLoading || !chatInput.trim()}
                >
                  <SendIcon />
                </button>
              </form>
            </section>

            <section id="saved" className="saved-panel" aria-labelledby="saved-title">
              <div className="section-title-row">
                <div>
                  <p className="section-kicker">03 / YOUR SHELF</p>
                  <h2 id="saved-title">Saved for another day.</h2>
                </div>
                {itemsState === 'ready' && <span className="shelf-count">{items.length} {items.length === 1 ? 'memory' : 'memories'}</span>}
              </div>
              {itemsState === 'loading' && <p className="shelf-state" role="status" aria-live="polite" aria-busy="true"><StateSpinner /> Gathering your saved reels...</p>}
              {itemsState === 'error' && (
                <div className="shelf-state shelf-state--error" role="alert">
                  <p>{itemsError}</p>
                  <button className="text-button" type="button" onClick={loadItems}>Try again</button>
                </div>
              )}
              {itemsState === 'ready' && items.length === 0 && (
                <div className="shelf-state shelf-state--empty">
                  <span className="empty-mark" aria-hidden="true">+</span>
                  <div><strong>Your shelf is taking a breath.</strong><p>Upload a screenshot and your first memory will land here.</p></div>
                  <a href="#upload">Add a reel</a>
                </div>
              )}
              {itemsState === 'ready' && items.length > 0 && (
                <div className="item-grid">
                  {items.map((item) => <ItemCard item={item} key={item.id} />)}
                </div>
              )}
            </section>
          </div>
        </div>
      </main>

      <footer className="site-footer">
        <p>Your saved reels, finally remembered.</p>
        <div><a className="wordmark wordmark--footer" href="#top">{"Mem<3ry"}</a><span>Built for your next “where was that?”</span></div>
      </footer>
    </div>
  );
}

export default App;
