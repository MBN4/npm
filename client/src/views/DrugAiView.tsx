import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext.js';
import {
  Sparkles,
  AlertTriangle,
  XCircle,
  Search,
  BookOpen,
  MessageSquare,
  Send,
  Pill,
  Baby,
  Utensils
} from 'lucide-react';

export const DrugAiView: React.FC = () => {
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState<'interaction' | 'monograph' | 'chat'>('interaction');
  const [allMedicines, setAllMedicines] = useState<any[]>([]);
  const [allCustomers, setAllCustomers] = useState<any[]>([]);

  // 1. Interaction Checker State
  const [selectedMedIds, setSelectedMedIds] = useState<number[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [interactionResults, setInteractionResults] = useState<any>(null);
  const [isChecking, setIsChecking] = useState(false);

  // 2. Monograph State
  const [selectedMedForMonograph, setSelectedMedForMonograph] = useState<string>('1');
  const [monographData, setMonographData] = useState<any>(null);
  const [isLoadingMonograph, setIsLoadingMonograph] = useState(false);

  // 3. AI Chat State
  const [chatQuery, setChatQuery] = useState('');
  const [chatTargetMed, setChatTargetMed] = useState<string>('1');
  const [chatHistory, setChatHistory] = useState<any[]>([
    {
      sender: 'ai',
      text: 'Welcome to NMP Clinical Drug Safety Assistant. You can ask dosing guidelines, food interactions, renal/hepatic precautions, or pregnancy safety for any pharmacy medication.',
      badge: '[AI CLINICAL ADVICE - PHARMACIST VERIFICATION REQUIRED]'
    }
  ]);
  const [isConsulting, setIsConsulting] = useState(false);

  // Load medicines & customers list
  useEffect(() => {
    if (!token) return;
    fetch('/api/medicines', { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(data => setAllMedicines(data.medicines || []))
      .catch(console.error);

    fetch('/api/patients', { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(data => setAllCustomers(data.patients || []))
      .catch(console.error);
  }, [token]);

  // Handle Interaction Check
  const handleCheckInteractions = async () => {
    if (selectedMedIds.length === 0) return;
    setIsChecking(true);
    try {
      const res = await fetch('/api/clinical/check-interactions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          medicineIds: selectedMedIds,
          customerId: selectedCustomerId ? Number(selectedCustomerId) : undefined
        })
      });
      if (res.ok) {
        const json = await res.json();
        setInteractionResults(json);
      }
    } catch (err) {
      console.error('Interaction check failed:', err);
    } finally {
      setIsChecking(false);
    }
  };

  // Handle Fetch Monograph
  const fetchMonograph = useCallback(async (id: string) => {
    if (!token || !id) return;
    setIsLoadingMonograph(true);
    try {
      const res = await fetch(`/api/clinical/medicine/${id}/monograph`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const json = await res.json();
        setMonographData(json);
      }
    } catch (err) {
      console.error('Failed to load monograph:', err);
    } finally {
      setIsLoadingMonograph(false);
    }
  }, [token]);

  useEffect(() => {
    if (activeTab === 'monograph' && selectedMedForMonograph) {
      fetchMonograph(selectedMedForMonograph);
    }
  }, [activeTab, selectedMedForMonograph, fetchMonograph]);

  // Handle AI Chat Send
  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatQuery.trim() || isConsulting) return;

    const userMessage = { sender: 'user', text: chatQuery };
    setChatHistory(prev => [...prev, userMessage]);
    setChatQuery('');
    setIsConsulting(true);

    try {
      const res = await fetch('/api/clinical/ai-consult', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          query: userMessage.text,
          medicineId: chatTargetMed ? Number(chatTargetMed) : undefined
        })
      });

      if (res.ok) {
        const json = await res.json();
        setChatHistory(prev => [
          ...prev,
          {
            sender: 'ai',
            text: json.response,
            badge: json.badge,
            targetMedicine: json.targetMedicine
          }
        ]);
      }
    } catch (err) {
      setChatHistory(prev => [
        ...prev,
        {
          sender: 'ai',
          text: 'Error consulting clinical AI service. Please verify against offline BNF reference manual.',
          badge: '[SYSTEM NOTICE]'
        }
      ]);
    } finally {
      setIsConsulting(false);
    }
  };

  return (
    <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '1600px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Sparkles style={{ color: 'var(--primary)', width: '2rem', height: '2rem' }} />
            Drug Safety & AI Clinical Assistant
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.25rem' }}>
            Verified drug-drug interaction checker, allergy contraindication scanning, therapeutic monographs, and AI clinical query
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', background: 'var(--surface-hover)', padding: '0.25rem', borderRadius: 'var(--radius)' }}>
          <button
            onClick={() => setActiveTab('interaction')}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: 'var(--radius)',
              border: 'none',
              background: activeTab === 'interaction' ? 'var(--primary)' : 'transparent',
              color: activeTab === 'interaction' ? '#fff' : 'var(--text-main)',
              fontWeight: activeTab === 'interaction' ? '600' : 'normal',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.85rem'
            }}
          >
            <AlertTriangle size={16} /> Interaction & Allergy Checker
          </button>
          <button
            onClick={() => setActiveTab('monograph')}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: 'var(--radius)',
              border: 'none',
              background: activeTab === 'monograph' ? 'var(--primary)' : 'transparent',
              color: activeTab === 'monograph' ? '#fff' : 'var(--text-main)',
              fontWeight: activeTab === 'monograph' ? '600' : 'normal',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.85rem'
            }}
          >
            <BookOpen size={16} /> Clinical Monographs
          </button>
          <button
            onClick={() => setActiveTab('chat')}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: 'var(--radius)',
              border: 'none',
              background: activeTab === 'chat' ? 'var(--primary)' : 'transparent',
              color: activeTab === 'chat' ? '#fff' : 'var(--text-main)',
              fontWeight: activeTab === 'chat' ? '600' : 'normal',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.85rem'
            }}
          >
            <MessageSquare size={16} /> Clinical AI Consult
          </button>
        </div>
      </div>

      {/* ======================================================== */}
      {/* TAB 1: INTERACTION & ALLERGY CHECKER                     */}
      {/* ======================================================== */}
      {activeTab === 'interaction' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '1.5rem' }}>
          {/* Drug Selection Column */}
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Pill size={18} style={{ color: 'var(--primary)' }} />
              Select Regimen to Evaluate
            </h3>

            {/* Optional Customer */}
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '500', marginBottom: '0.25rem' }}>
                Optional Patient Profile (Allergy Cross-Reference):
              </label>
              <select
                value={selectedCustomerId}
                onChange={(e) => setSelectedCustomerId(e.target.value)}
                className="input-field"
                style={{ width: '100%' }}
              >
                <option value="">-- No specific patient profile --</option>
                {allCustomers.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.allergy_notes ? `[Allergy: ${c.allergy_notes}]` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Medicine Checklist */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: '500' }}>Select Medicines ({selectedMedIds.length} selected):</label>
              <div style={{ maxHeight: '320px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                {allMedicines.map(m => {
                  const isChecked = selectedMedIds.includes(m.id);
                  return (
                    <label
                      key={m.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        padding: '0.5rem 0.75rem',
                        borderRadius: '4px',
                        background: isChecked ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                        cursor: 'pointer',
                        fontSize: '0.85rem'
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {
                          if (isChecked) {
                            setSelectedMedIds(selectedMedIds.filter(id => id !== m.id));
                          } else {
                            setSelectedMedIds([...selectedMedIds, m.id]);
                          }
                        }}
                        style={{ width: '16px', height: '16px' }}
                      />
                      <div>
                        <div style={{ fontWeight: '600' }}>{m.brand_name} ({m.strength})</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{m.generic_name} • {m.dosage_form}</div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            <button
              onClick={handleCheckInteractions}
              disabled={selectedMedIds.length === 0 || isChecking}
              className="btn btn-primary"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '0.75rem', fontSize: '1rem', marginTop: '0.5rem' }}
            >
              <Sparkles size={18} /> {isChecking ? 'Scanning Databases...' : 'Evaluate Clinical Safety'}
            </button>
          </div>

          {/* Evaluation Results Column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {!interactionResults ? (
              <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px dashed var(--border)', padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                <AlertTriangle size={36} style={{ color: 'var(--text-muted)', marginBottom: '0.75rem' }} />
                <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>No Regimen Evaluated Yet</h3>
                <p style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>Select 2 or more medicines on the left and click "Evaluate Clinical Safety" to run multi-point DDI and allergy scanning.</p>
              </div>
            ) : (
              <>
                {/* Status Card */}
                <div style={{
                  padding: '1.25rem',
                  borderRadius: 'var(--radius)',
                  background: interactionResults.summary.safetyStatus === 'DANGER'
                    ? 'rgba(239, 68, 68, 0.15)'
                    : interactionResults.summary.safetyStatus === 'WARNING'
                    ? 'rgba(245, 158, 11, 0.15)'
                    : 'rgba(16, 185, 129, 0.15)',
                  border: `1px solid ${
                    interactionResults.summary.safetyStatus === 'DANGER'
                      ? 'var(--danger)'
                      : interactionResults.summary.safetyStatus === 'WARNING'
                      ? 'var(--warning)'
                      : 'var(--success)'
                  }`,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <div>
                    <div style={{
                      fontSize: '1.2rem',
                      fontWeight: 'bold',
                      color: interactionResults.summary.safetyStatus === 'DANGER'
                        ? 'var(--danger)'
                        : interactionResults.summary.safetyStatus === 'WARNING'
                        ? 'var(--warning)'
                        : 'var(--success)'
                    }}>
                      {interactionResults.summary.safetyStatus === 'CLEAR'
                        ? '✓ REGIMEN CLINICALLY CLEAR'
                        : interactionResults.summary.safetyStatus === 'DANGER'
                        ? '✕ CRITICAL CONTRAINDICATION / ALLERGY DETECTED'
                        : '⚠ POTENTIAL CLINICAL INTERACTIONS DETECTED'}
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                      Evaluated {interactionResults.summary.medicinesEvaluated} items • {interactionResults.summary.interactionsCount} DDIs • {interactionResults.summary.allergyAlertsCount} allergy alerts
                    </div>
                  </div>
                </div>

                {/* Patient Allergy Alerts */}
                {interactionResults.allergyAlerts.map((alert: any, idx: number) => (
                  <div key={idx} style={{ background: '#7f1d1d', color: '#fff', padding: '1rem', borderRadius: 'var(--radius)', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <div style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.95rem' }}>
                      <XCircle size={18} /> SEVERE PATIENT ALLERGY CONTRAINDICATION
                    </div>
                    <div style={{ fontSize: '0.85rem' }}>{alert.warning}</div>
                  </div>
                ))}

                {/* Duplicate Therapies */}
                {interactionResults.duplicateTherapies.map((dup: any, idx: number) => (
                  <div key={idx} style={{ background: 'var(--surface)', border: '1px solid var(--warning)', padding: '1rem', borderRadius: 'var(--radius)', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <div style={{ fontWeight: 'bold', color: 'var(--warning)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
                      <AlertTriangle size={16} /> DUPLICATE THERAPY: {dup.therapeuticClass}
                    </div>
                    <div style={{ fontSize: '0.85rem' }}>{dup.warning}</div>
                  </div>
                ))}

                {/* Drug-Drug Interactions */}
                {interactionResults.interactions.map((int: any, idx: number) => (
                  <div key={idx} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ fontSize: '0.95rem' }}>
                        {int.drugA.brandName} + {int.drugB.brandName}
                      </strong>
                      <span style={{
                        padding: '0.2rem 0.6rem',
                        borderRadius: '4px',
                        fontWeight: 'bold',
                        fontSize: '0.75rem',
                        background: int.severity === 'CONTRAINDICATED' ? '#ef4444' : int.severity === 'MAJOR' ? '#f59e0b' : '#3b82f6',
                        color: '#fff'
                      }}>
                        {int.severity} INTERACTION
                      </span>
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-main)' }}>
                      <strong>Effect:</strong> {int.effect}
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--primary)', background: 'var(--surface-hover)', padding: '0.5rem', borderRadius: '4px' }}>
                      <strong>Management:</strong> {int.management}
                    </div>
                  </div>
                ))}

                {/* Pregnancy warnings */}
                {interactionResults.pregnancyWarnings.map((preg: any, idx: number) => (
                  <div key={idx} style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '0.75rem 1rem', borderRadius: 'var(--radius)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Baby size={16} style={{ color: 'var(--warning)' }} />
                      <span><strong>{preg.brandName}:</strong> Pregnancy Category <strong>{preg.category}</strong></span>
                    </div>
                    <span style={{ color: 'var(--warning)', fontWeight: '600' }}>{preg.risk}</span>
                  </div>
                ))}

                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic', textAlign: 'center', marginTop: '0.5rem' }}>
                  {interactionResults.disclaimer}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 2: CLINICAL MONOGRAPHS & SALT REFERENCE             */}
      {/* ======================================================== */}
      {activeTab === 'monograph' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Medicine Selector */}
          <div style={{ background: 'var(--surface)', padding: '1rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <label style={{ fontWeight: 'bold', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Search size={16} style={{ color: 'var(--primary)' }} /> Select Medicine for Full Monograph:
            </label>
            <select
              value={selectedMedForMonograph}
              onChange={(e) => setSelectedMedForMonograph(e.target.value)}
              className="input-field"
              style={{ width: '320px', padding: '0.4rem 0.75rem' }}
            >
              {allMedicines.map(m => (
                <option key={m.id} value={m.id}>{m.brand_name} ({m.strength})</option>
              ))}
            </select>
          </div>

          {isLoadingMonograph ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading clinical monograph...</div>
          ) : monographData?.monograph && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: '1.5rem' }}>
              {/* Pharmacology & Dosage Card */}
              <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
                  <h2 style={{ fontSize: '1.4rem', fontWeight: 'bold', color: 'var(--primary)' }}>
                    {monographData.monograph.brand_name}
                  </h2>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                    Generic: <strong>{monographData.monograph.generic_name}</strong> • Class: <em>{monographData.monograph.therapeutic_class}</em>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div style={{ background: 'var(--surface-hover)', padding: '0.75rem', borderRadius: 'var(--radius)' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>PREGNANCY CATEGORY</div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--warning)' }}>
                      Category {monographData.monograph.pregnancy_category || 'N/A'}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Lactation: {monographData.monograph.lactation_safety || 'Consult MD'}</div>
                  </div>

                  <div style={{ background: 'var(--surface-hover)', padding: '0.75rem', borderRadius: 'var(--radius)' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>PHARMACY SHELF</div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>
                      {monographData.monograph.rack_location || 'General Store'}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Pack Size: {monographData.monograph.pack_size} units</div>
                  </div>
                </div>

                <div>
                  <h4 style={{ fontSize: '0.9rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Pill size={15} style={{ color: 'var(--primary)' }} /> Adult Dosage Protocol:
                  </h4>
                  <p style={{ fontSize: '0.85rem', marginTop: '0.25rem', color: 'var(--text-main)', background: 'var(--surface-hover)', padding: '0.6rem', borderRadius: '4px' }}>
                    {monographData.monograph.adult_dosage || 'Follow physician prescription orders.'}
                  </p>
                </div>

                <div>
                  <h4 style={{ fontSize: '0.9rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Baby size={15} style={{ color: 'var(--primary)' }} /> Pediatric Considerations:
                  </h4>
                  <p style={{ fontSize: '0.85rem', marginTop: '0.25rem', color: 'var(--text-main)', background: 'var(--surface-hover)', padding: '0.6rem', borderRadius: '4px' }}>
                    {monographData.monograph.pediatric_dosage || 'Safety and effectiveness in pediatric patients not established.'}
                  </p>
                </div>

                <div>
                  <h4 style={{ fontSize: '0.9rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Utensils size={15} style={{ color: 'var(--primary)' }} /> Administration & Food Timing:
                  </h4>
                  <p style={{ fontSize: '0.85rem', marginTop: '0.25rem', color: 'var(--text-main)', background: 'var(--surface-hover)', padding: '0.6rem', borderRadius: '4px' }}>
                    {monographData.monograph.food_instructions || 'Take with water.'}
                  </p>
                </div>
              </div>

              {/* Precautions & In-Stock Substitutes */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {/* Hepatic/Renal */}
                <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <h4 style={{ fontSize: '0.9rem', fontWeight: 'bold', color: 'var(--danger)' }}>
                    Organ Safety & Renal Precautions
                  </h4>
                  <p style={{ fontSize: '0.85rem' }}>
                    {monographData.monograph.hepatic_renal_precautions || 'No special organ dose adjustment specified.'}
                  </p>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                    <strong>Reported Adverse Reactions:</strong> {monographData.monograph.common_side_effects || 'None common.'}
                  </div>
                </div>

                {/* In-Stock Generic Substitutes */}
                <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div style={{ fontWeight: 'bold', fontSize: '0.95rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>In-Stock Equivalent Brands (Same Salt)</span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{monographData.substitutes.length} alternatives</span>
                  </div>

                  {monographData.substitutes.length === 0 ? (
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', padding: '1rem 0' }}>
                      No alternative brands available in inventory sharing this exact generic salt.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {monographData.substitutes.map((sub: any) => (
                        <div key={sub.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: 'var(--surface-hover)', borderRadius: '4px', fontSize: '0.85rem' }}>
                          <div>
                            <div style={{ fontWeight: '600' }}>{sub.brand_name} ({sub.strength})</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{sub.manufacturer_name}</div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontWeight: 'bold', color: sub.available_stock > 0 ? 'var(--success)' : 'var(--danger)' }}>
                              {sub.available_stock > 0 ? `${sub.available_stock} in stock` : 'Out of Stock'}
                            </div>
                            <div style={{ fontSize: '0.75rem' }}>Rs. {sub.min_price || '—'}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 3: CLINICAL AI CONSULT CHATBOT                      */}
      {/* ======================================================== */}
      {activeTab === 'chat' && (
        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '1.5rem', height: '600px' }}>
          {/* Target Drug Context Panel */}
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h3 style={{ fontWeight: 'bold', fontSize: '1rem' }}>Context Drug Reference</h3>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.25rem' }}>Focus Medication:</label>
              <select
                value={chatTargetMed}
                onChange={(e) => setChatTargetMed(e.target.value)}
                className="input-field"
                style={{ width: '100%' }}
              >
                {allMedicines.map(m => (
                  <option key={m.id} value={m.id}>{m.brand_name}</option>
                ))}
              </select>
            </div>

            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
              <strong>Quick Prompts:</strong>
              <ul style={{ paddingLeft: '1.25rem', marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <li style={{ cursor: 'pointer', color: 'var(--primary)' }} onClick={() => setChatQuery('What is the recommended adult dosage?')}>
                  Adult dosage protocol
                </li>
                <li style={{ cursor: 'pointer', color: 'var(--primary)' }} onClick={() => setChatQuery('Should this be taken before or after meals?')}>
                  Food & meal timing
                </li>
                <li style={{ cursor: 'pointer', color: 'var(--primary)' }} onClick={() => setChatQuery('Is this drug safe during pregnancy and lactation?')}>
                  Pregnancy safety profile
                </li>
                <li style={{ cursor: 'pointer', color: 'var(--primary)' }} onClick={() => setChatQuery('Are there organ dosage adjustments for renal impairment?')}>
                  Renal dose adjustment
                </li>
              </ul>
            </div>
          </div>

          {/* Chat Stream & Input */}
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ flex: 1, padding: '1rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {chatHistory.map((msg, i) => (
                <div
                  key={i}
                  style={{
                    alignSelf: msg.sender === 'user' ? 'flex-end' : 'flex-start',
                    maxWidth: '80%',
                    background: msg.sender === 'user' ? 'var(--primary)' : 'var(--surface-hover)',
                    color: msg.sender === 'user' ? '#fff' : 'var(--text-main)',
                    padding: '0.75rem 1rem',
                    borderRadius: 'var(--radius)',
                    fontSize: '0.9rem'
                  }}
                >
                  {msg.badge && (
                    <div style={{ fontSize: '0.7rem', fontWeight: 'bold', color: 'var(--warning)', marginBottom: '0.35rem' }}>
                      {msg.badge}
                    </div>
                  )}
                  <div>{msg.text}</div>
                </div>
              ))}
              {isConsulting && (
                <div style={{ alignSelf: 'flex-start', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  Clinical reasoning in progress...
                </div>
              )}
            </div>

            <form onSubmit={handleSendChat} style={{ padding: '0.75rem', borderTop: '1px solid var(--border)', display: 'flex', gap: '0.5rem' }}>
              <input
                type="text"
                value={chatQuery}
                onChange={(e) => setChatQuery(e.target.value)}
                placeholder="Ask clinical question (dosage, food, pregnancy, organ precautions)..."
                className="input-field"
                style={{ flex: 1 }}
              />
              <button type="submit" disabled={isConsulting || !chatQuery.trim()} className="btn btn-primary">
                <Send size={16} />
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
