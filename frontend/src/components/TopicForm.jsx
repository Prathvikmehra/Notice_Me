import React, { useState } from 'react';

export default function TopicForm({ onCreate }) {
  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('scheme');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await onCreate({ name: name.trim(), query: query.trim(), category });
      setName('');
      setQuery('');
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="topic-form" onSubmit={submit}>
      <div className="section-label">START WATCHING</div>
      <label htmlFor="topic-name">Topic name</label>
      <input id="topic-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} placeholder="e.g. SSC CGL 2026" required />
      <label htmlFor="topic-query">Search query</label>
      <input id="topic-query" value={query} onChange={(event) => setQuery(event.target.value)} maxLength={500} placeholder="What should we watch for?" required />
      <label htmlFor="topic-category">Category</label>
      <select id="topic-category" value={category} onChange={(event) => setCategory(event.target.value)}>
        <option value="scheme">Government scheme</option>
        <option value="exam">Exam or recruitment</option>
        <option value="case">Court or policy</option>
        <option value="other">Other</option>
      </select>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="button button-primary" disabled={busy} type="submit">{busy ? 'Adding…' : '+ Add topic'}</button>
    </form>
  );
}
