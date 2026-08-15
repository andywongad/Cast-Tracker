import { useState } from 'react';
import { useUI } from '../hooks/useUI';
import Sheet from './Sheet';

export default function FeedbackSheet() {
  const { feedbackOpen, closeFeedback } = useUI();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const response = await fetch('https://formspree.io/f/mvzeelny', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, message }),
      });

      if (response.ok) {
        setSubmitted(true);
        setName('');
        setEmail('');
        setMessage('');
        setTimeout(() => setSubmitted(false), 3000);
      }
    } catch (error) {
      console.error('Feedback submission failed:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!feedbackOpen) return null;

  return (
    <Sheet onClose={closeFeedback} label="Send us feedback" scrimStyle={{ zIndex: 50 }}>
        <button onClick={closeFeedback} style={{ position: 'absolute', right: 18, top: 16, width: 32, height: 32, borderRadius: 999, background: 'var(--surface)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 20, color: 'var(--text)' }}>×</button>
        <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 18 }}>Send Us Feedback</div>

        {submitted ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text)' }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>✅ Thank you!</div>
            <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>Your feedback has been received. We appreciate it!</div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13.5, fontWeight: 800, letterSpacing: '0.07em', color: '#C9924A', marginBottom: 7 }}>NAME</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                style={{ width: '100%', height: 46, border: '1px solid var(--input-border)', borderRadius: 11, background: 'var(--surface)', padding: '0 13px', fontSize: 15, color: 'var(--text)', outline: 'none' }}
                required
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13.5, fontWeight: 800, letterSpacing: '0.07em', color: '#C9924A', marginBottom: 7 }}>EMAIL</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                style={{ width: '100%', height: 46, border: '1px solid var(--input-border)', borderRadius: 11, background: 'var(--surface)', padding: '0 13px', fontSize: 15, color: 'var(--text)', outline: 'none' }}
                required
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13.5, fontWeight: 800, letterSpacing: '0.07em', color: '#C9924A', marginBottom: 7 }}>MESSAGE</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Tell us what you think..."
                style={{ width: '100%', minHeight: 100, border: '1px solid var(--input-border)', borderRadius: 11, background: 'var(--surface)', padding: '11px 13px', fontSize: 14, lineHeight: 1.5, color: 'var(--text)', outline: 'none', fontFamily: 'inherit', resize: 'none' }}
                required
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              style={{ height: 48, border: 'none', borderRadius: 13, background: 'var(--accent)', color: 'var(--accent-text)', fontSize: 14.5, fontWeight: 700, cursor: isSubmitting ? 'not-allowed' : 'pointer', opacity: isSubmitting ? 0.7 : 1, transition: 'all 0.2s ease' }}
            >
              {isSubmitting ? 'Sending...' : 'Send Feedback'}
            </button>
          </form>
        )}
    </Sheet>
  );
}