import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext.js';
import {
  Bot,
  Sparkles,
  Send,
  Pill,
  ShieldCheck,
  FileCheck
} from 'lucide-react';

interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  verifiedData?: string;
  aiExplanation?: string;
  substitutes?: any[];
  badge?: string;
  timestamp: string;
}

export const PharmaAiView: React.FC = () => {
  const { token } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'ai',
      text: 'Hello! I am Pharma.AI, your dedicated clinical safety assistant for Naveed Medical Pharmacy. Ask me about drug dosing, brand alternatives, generic bioequivalents, pregnancy risks, or food administration instructions.',
      verifiedData: 'Clinical Safety Protocol Active. All verified medical data is sourced directly from relational pharmacopoeia monographs.',
      badge: '[AI CLINICAL ASSISTANT - VERIFY CLINICALLY]',
      timestamp: new Date().toLocaleTimeString()
    }
  ]);

  const [inputQuery, setInputQuery] = useState('');
  const [selectedMedId, setSelectedMedId] = useState<string>('');
  const [medicines, setMedicines] = useState<any[]>([]);
  const [isConsulting, setIsConsulting] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Load medicines for target selector
  useEffect(() => {
    async function loadMedicines() {
      try {
        const res = await fetch('/api/medicines?limit=100', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setMedicines(data.medicines || []);
        }
      } catch (err) {
        console.error(err);
      }
    }
    loadMedicines();
  }, [token]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (queryText?: string) => {
    const q = (queryText || inputQuery).trim();
    if (!q) return;

    const userMsg: ChatMessage = {
      id: 'user-' + Date.now(),
      sender: 'user',
      text: q,
      timestamp: new Date().toLocaleTimeString()
    };

    setMessages(prev => [...prev, userMsg]);
    if (!queryText) setInputQuery('');
    setIsConsulting(true);

    try {
      const res = await fetch('/api/clinical/ai-consult', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          query: q,
          medicineId: selectedMedId ? Number(selectedMedId) : undefined
        })
      });

      if (res.ok) {
        const data = await res.json();
        const aiMsg: ChatMessage = {
          id: 'ai-' + Date.now(),
          sender: 'ai',
          text: data.response || data.aiExplanation || 'Clinical guidance retrieved.',
          verifiedData: data.verifiedData,
          aiExplanation: data.aiExplanation,
          substitutes: data.substitutes,
          badge: data.badge || '[AI CLINICAL ASSISTANT - VERIFY CLINICALLY]',
          timestamp: new Date().toLocaleTimeString()
        };
        setMessages(prev => [...prev, aiMsg]);
      } else {
        throw new Error('Failed to obtain AI response');
      }
    } catch (err: any) {
      setMessages(prev => [
        ...prev,
        {
          id: 'ai-err-' + Date.now(),
          sender: 'ai',
          text: 'Unable to complete clinical consultation: ' + (err.message || 'Server error'),
          timestamp: new Date().toLocaleTimeString()
        }
      ]);
    } finally {
      setIsConsulting(false);
    }
  };

  const quickPrompts = [
    { label: 'Brand Alternatives', query: 'What in-stock brand alternatives exist for this medicine?' },
    { label: 'Dose Guidelines', query: 'What is the standard adult dosage and administration frequency?' },
    { label: 'Food Timing', query: 'Should this medicine be taken before, with, or after food?' },
    { label: 'Pregnancy Safety', query: 'What is the FDA pregnancy category and lactation safety rating?' },
    { label: 'Side Effects', query: 'What are the documented common adverse side effects?' }
  ];

  return (
    <div className="view-container">
      {/* Header */}
      <div className="view-header" style={{ marginBottom: '1.25rem' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Bot size={24} style={{ color: '#0284c7' }} />
            Pharma.AI 🤖 Clinical Safety Assistant
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            Intelligent pharmaceutical assistant for dose checks, bioequivalent substitutions, drug interactions, and clinical counseling.
          </p>
        </div>

        {/* Safety Boundary Notice Badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.8rem', backgroundColor: 'rgba(16, 185, 129, 0.1)', color: 'var(--success)', borderRadius: 'var(--radius-full)', fontSize: '0.75rem', fontWeight: 700 }}>
          <ShieldCheck size={15} />
          <span>PHARMACIST-IN-THE-LOOP PROTOCOL</span>
        </div>
      </div>

      {/* Main Grid: Target Context Selector + Chat Workspace */}
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '1.25rem' }}>
        {/* Left Side: Clinical Context Anchor */}
        <div className="card" style={{ padding: '1.25rem', height: 'fit-content' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Pill size={16} style={{ color: 'var(--primary)' }} />
            Context Medicine Anchor
          </h2>

          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
            Optionally anchor your consultation to a specific medicine in inventory:
          </p>

          <select
            className="input"
            value={selectedMedId}
            onChange={e => setSelectedMedId(e.target.value)}
            style={{ marginBottom: '1.25rem' }}
          >
            <option value="">-- General Pharmacy Consultation --</option>
            {medicines.map(m => (
              <option key={m.id} value={m.id}>
                {m.brand_name} {m.strength} ({m.dosage_form})
              </option>
            ))}
          </select>

          <h3 style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
            Quick Clinical Queries
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {quickPrompts.map(p => (
              <button
                key={p.label}
                onClick={() => handleSend(p.query)}
                className="btn btn-secondary btn-sm"
                style={{ textAlign: 'left', fontSize: '0.78rem', justifyContent: 'flex-start' }}
              >
                <Sparkles size={13} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                <span>{p.label}</span>
              </button>
            ))}
          </div>

          <div style={{ marginTop: '1.5rem', padding: '0.85rem', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
            <div style={{ fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <ShieldCheck size={13} style={{ color: 'var(--success)' }} />
              Clinical Safety Policy
            </div>
            Pharma.AI distinguishes verified pharmacopoeia records from AI interpretations. AI never silently mutates inventory or prescriptions.
          </div>
        </div>

        {/* Right Side: Interactive Chat Terminal */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', height: '700px', padding: 0, overflow: 'hidden' }}>
          {/* Chat Messages Stream */}
          <div style={{ flex: 1, padding: '1.25rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {messages.map(msg => (
              <div
                key={msg.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignSelf: msg.sender === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: msg.sender === 'user' ? '75%' : '90%'
                }}
              >
                {/* Message Header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.25rem', fontSize: '0.72rem', color: 'var(--text-muted)', alignSelf: msg.sender === 'user' ? 'flex-end' : 'flex-start' }}>
                  {msg.sender === 'user' ? (
                    <span>You • {msg.timestamp}</span>
                  ) : (
                    <>
                      <Bot size={14} style={{ color: 'var(--primary)' }} />
                      <span style={{ fontWeight: 700, color: 'var(--primary)' }}>Pharma.AI</span>
                      <span>• {msg.timestamp}</span>
                    </>
                  )}
                </div>

                {/* Message Bubble */}
                <div
                  style={{
                    padding: '1rem 1.25rem',
                    borderRadius: 'var(--radius-lg)',
                    backgroundColor: msg.sender === 'user' ? 'var(--primary)' : 'var(--bg-card-header)',
                    color: msg.sender === 'user' ? '#ffffff' : 'var(--text-main)',
                    border: msg.sender === 'user' ? 'none' : '1px solid var(--border)',
                    boxShadow: 'var(--shadow-sm)',
                    fontSize: '0.9rem',
                    lineHeight: '1.5'
                  }}
                >
                  {/* Verified Database Information Block */}
                  {msg.verifiedData && (
                    <div style={{ marginBottom: '0.75rem', padding: '0.65rem 0.85rem', backgroundColor: 'rgba(2, 132, 199, 0.08)', borderLeft: '3px solid var(--primary)', borderRadius: '4px', fontSize: '0.8rem', color: 'var(--text-main)' }}>
                      <div style={{ fontWeight: 700, fontSize: '0.7rem', color: 'var(--primary)', textTransform: 'uppercase', marginBottom: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <FileCheck size={12} />
                        Verified Database Record
                      </div>
                      <div style={{ whiteSpace: 'pre-line' }}>{msg.verifiedData}</div>
                    </div>
                  )}

                  {/* AI Explanation / Response */}
                  <div style={{ whiteSpace: 'pre-line' }}>{msg.text}</div>

                  {/* Badge Disclaimer */}
                  {msg.badge && (
                    <div style={{ marginTop: '0.6rem', fontSize: '0.68rem', fontWeight: 700, color: 'var(--primary)', opacity: 0.85 }}>
                      {msg.badge}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {isConsulting && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--primary)', fontSize: '0.82rem', padding: '0.5rem' }}>
                <div style={{ width: '16px', height: '16px', border: '2px solid var(--primary)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                <span>Pharma.AI is analyzing clinical knowledge database...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Bar */}
          <div style={{ padding: '1rem', borderTop: '1px solid var(--border)', backgroundColor: 'var(--bg-surface)' }}>
            <form
              onSubmit={e => {
                e.preventDefault();
                handleSend();
              }}
              style={{ display: 'flex', gap: '0.75rem' }}
            >
              <input
                type="text"
                className="input"
                style={{ flex: 1 }}
                placeholder="Ask Pharma.AI about drug dosage, alternatives, food timings, or drug interactions..."
                value={inputQuery}
                onChange={e => setInputQuery(e.target.value)}
                disabled={isConsulting}
              />
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isConsulting || !inputQuery.trim()}
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0 1.25rem' }}
              >
                <Send size={16} />
                <span>Send</span>
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
