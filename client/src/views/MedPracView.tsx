import React, { useState } from 'react';
import {
  FlaskConical,
  GraduationCap,
  Plus,
  Trash2,
  Printer,
  RotateCcw,
  Save,
  BookOpen,
  HelpCircle,
  FileText
} from 'lucide-react';

interface PracticeItem {
  id: string;
  medicineName: string;
  genericName: string;
  strength: string;
  dosageForm: string;
  quantity: string; // Custom manual practice quantity: '1 tablet', '5 mL', '20 units', etc.
  dose: string;
  frequency: string; // OD, BD, TDS, QID, SOS, HS, Stat, Custom
  duration: string;
  route: string;
  timing: string;
  instructions: string;
}

interface PracticeCase {
  id: string;
  title: string;
  patientName: string;
  patientAge: string;
  patientGender: string;
  diagnosis: string;
  doctorName: string;
  items: PracticeItem[];
  savedAt: string;
}

export const MedPracView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'prescription' | 'quiz' | 'cases'>('prescription');

  // Practice Prescription State
  const [patientName, setPatientName] = useState('John Doe (Practice)');
  const [patientAge, setPatientAge] = useState('35');
  const [patientGender, setPatientGender] = useState('Male');
  const [diagnosis, setDiagnosis] = useState('Acute Bacterial Sinusitis');
  const [doctorName, setDoctorName] = useState('Dr. A. R. Khan (Consultant Physician)');

  const [items, setItems] = useState<PracticeItem[]>([
    {
      id: '1',
      medicineName: 'Augmentin 625mg',
      genericName: 'Amoxicillin + Clavulanic Acid',
      strength: '625mg',
      dosageForm: 'Tablet',
      quantity: '14 tablets',
      dose: '1 Tablet',
      frequency: 'BD (Twice Daily)',
      duration: '7 Days',
      route: 'Oral',
      timing: 'After Food (Start of Meal)',
      instructions: 'Complete full course even if symptoms improve.'
    },
    {
      id: '2',
      medicineName: 'Panadol Extra',
      genericName: 'Paracetamol + Caffeine',
      strength: '500mg/65mg',
      dosageForm: 'Tablet',
      quantity: '10 tablets',
      dose: '1-2 Tablets',
      frequency: 'TDS (Three Times Daily / SOS)',
      duration: '3 Days',
      route: 'Oral',
      timing: 'After Food',
      instructions: 'Take for pain/fever. Do not exceed 8 tablets in 24 hours.'
    }
  ]);

  // Saved practice cases in local storage
  const [savedCases, setSavedCases] = useState<PracticeCase[]>(() => {
    try {
      const stored = localStorage.getItem('nmp_medprac_cases');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // Quiz State
  const [quizScore, setQuizScore] = useState<number | null>(null);
  const [quizAnswers, setQuizAnswers] = useState<Record<number, string>>({});
  const [showQuizResults, setShowQuizResults] = useState(false);

  const quizQuestions = [
    {
      id: 1,
      question: 'A prescription reads "Amoxicillin 250mg TDS for 7 days". What does "TDS" mean and how many total doses will the patient take?',
      options: [
        'Once daily, 7 total doses',
        'Twice daily, 14 total doses',
        'Three times daily (ter die sumendum), 21 total doses',
        'Four times daily, 28 total doses'
      ],
      correctAnswer: 'Three times daily (ter die sumendum), 21 total doses',
      explanation: 'TDS stands for "ter die sumendum" (3 times daily). Over 7 days, 3 × 7 = 21 doses.'
    },
    {
      id: 2,
      question: 'A child weighing 15 kg requires Paracetamol suspension (120mg/5mL) at a dose of 15 mg/kg. How many milliliters (mL) should be administered per dose?',
      options: [
        '5.0 mL',
        '9.375 mL',
        '10.0 mL',
        '15.0 mL'
      ],
      correctAnswer: '9.375 mL',
      explanation: 'Dose = 15 kg × 15 mg/kg = 225 mg. Concentration = 120 mg / 5 mL = 24 mg/mL. Volume = 225 mg ÷ 24 mg/mL = 9.375 mL.'
    },
    {
      id: 3,
      question: 'Which administration timing is standard for Proton Pump Inhibitors (e.g. Omeprazole 20mg)?',
      options: [
        'Immediately after a heavy meal',
        '30 to 60 minutes before breakfast on an empty stomach',
        'At bedtime with milk',
        'Only when acute heartburn occurs (SOS)'
      ],
      correctAnswer: '30 to 60 minutes before breakfast on an empty stomach',
      explanation: 'PPIs block active proton pumps and must be taken 30-60 minutes prior to meals for maximum pharmacological suppression.'
    },
    {
      id: 4,
      question: 'What does "Stat" mean on a medical prescription?',
      options: [
        'Take at bedtime (hora somni)',
        'Take as needed for symptoms (si opus sit)',
        'Immediately / At once as a single initial dose',
        'Every 6 hours'
      ],
      correctAnswer: 'Immediately / At once as a single initial dose',
      explanation: '"Stat" is Latin for "statim", meaning immediately / without delay.'
    }
  ];

  const handleAddItem = () => {
    const newItem: PracticeItem = {
      id: Date.now().toString(),
      medicineName: 'New Medicine (Practice)',
      genericName: 'Active Ingredient',
      strength: '500mg',
      dosageForm: 'Tablet',
      quantity: '10 tablets',
      dose: '1 Tablet',
      frequency: 'BD (Twice Daily)',
      duration: '5 Days',
      route: 'Oral',
      timing: 'After Food',
      instructions: 'Take with plenty of water.'
    };
    setItems([...items, newItem]);
  };

  const handleUpdateItem = (id: string, field: keyof PracticeItem, value: string) => {
    setItems(items.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const handleRemoveItem = (id: string) => {
    setItems(items.filter(item => item.id !== id));
  };

  const handleReset = () => {
    setPatientName('Practice Patient');
    setPatientAge('30');
    setPatientGender('Female');
    setDiagnosis('Upper Respiratory Tract Infection');
    setDoctorName('Dr. Practice Physician');
    setItems([]);
  };

  const handleSaveCase = () => {
    const newCase: PracticeCase = {
      id: 'CASE-' + Date.now(),
      title: `${diagnosis} — ${patientName}`,
      patientName,
      patientAge,
      patientGender,
      diagnosis,
      doctorName,
      items,
      savedAt: new Date().toLocaleDateString()
    };
    const updated = [newCase, ...savedCases];
    setSavedCases(updated);
    localStorage.setItem('nmp_medprac_cases', JSON.stringify(updated));
    alert('Practice case saved to MedPrac sandbox library!');
  };

  const handleLoadCase = (c: PracticeCase) => {
    setPatientName(c.patientName);
    setPatientAge(c.patientAge);
    setPatientGender(c.patientGender);
    setDiagnosis(c.diagnosis);
    setDoctorName(c.doctorName);
    setItems(c.items);
    setActiveTab('prescription');
  };

  const handleDeleteCase = (id: string) => {
    const updated = savedCases.filter(c => c.id !== id);
    setSavedCases(updated);
    localStorage.setItem('nmp_medprac_cases', JSON.stringify(updated));
  };

  const handleGradeQuiz = () => {
    let correct = 0;
    quizQuestions.forEach(q => {
      if (quizAnswers[q.id] === q.correctAnswer) {
        correct++;
      }
    });
    setQuizScore(correct);
    setShowQuizResults(true);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="view-container">
      {/* Persistent Sandbox Isolation Banner */}
      <div
        style={{
          padding: '0.75rem 1.25rem',
          backgroundColor: 'rgba(56, 189, 248, 0.12)',
          border: '1px solid rgba(56, 189, 248, 0.35)',
          borderRadius: 'var(--radius-md)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.25rem'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <FlaskConical size={20} style={{ color: '#0284c7' }} />
          <div>
            <span style={{ fontWeight: 800, fontSize: '0.85rem', color: '#0284c7', letterSpacing: '0.5px' }}>
              MEDPRAC 🧪 — ISOLATED PHARMACY PRACTICE & LEARNING ENVIRONMENT
            </span>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              Simulation mode active. Practice entries never affect real pharmacy inventory, accounts, billing, or patient records.
            </div>
          </div>
        </div>

        <span className="badge badge-primary" style={{ fontWeight: 800, letterSpacing: '0.5px' }}>
          100% ZERO-SIDE-EFFECT SANDBOX
        </span>
      </div>

      {/* View Header & Tabs */}
      <div className="view-header" style={{ marginBottom: '1.25rem' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <GraduationCap size={24} style={{ color: 'var(--primary)' }} />
            MedPrac Clinical Practice Suite
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            Practice dispensing protocols, custom manual dosing amounts, prescription simulation, and dosage calculation quizzes.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={() => setActiveTab('prescription')}
            className={`btn ${activeTab === 'prescription' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <FileText size={16} />
            <span>Practice Prescription</span>
          </button>
          <button
            onClick={() => setActiveTab('quiz')}
            className={`btn ${activeTab === 'quiz' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <HelpCircle size={16} />
            <span>Dosage Quizzes</span>
          </button>
          <button
            onClick={() => setActiveTab('cases')}
            className={`btn ${activeTab === 'cases' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <BookOpen size={16} />
            <span>Saved Cases ({savedCases.length})</span>
          </button>
        </div>
      </div>

      {/* ========================================================= */}
      {/* TAB 1: PRACTICE PRESCRIPTION SIMULATOR                    */}
      {/* ========================================================= */}
      {activeTab === 'prescription' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: '1.25rem' }}>
          {/* Left Form: Editable Practice Case */}
          <div className="card" style={{ padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ fontSize: '1.05rem', fontWeight: 700 }}>Prescription Simulation Builder</h2>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <button onClick={handleReset} className="btn btn-secondary btn-sm" title="Clear form">
                  <RotateCcw size={14} />
                  <span>Reset</span>
                </button>
                <button onClick={handleSaveCase} className="btn btn-secondary btn-sm" title="Save case">
                  <Save size={14} />
                  <span>Save Case</span>
                </button>
              </div>
            </div>

            {/* Patient & Doctor Profile */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 100px', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, marginBottom: '0.2rem' }}>Patient Name</label>
                <input type="text" className="input" value={patientName} onChange={e => setPatientName(e.target.value)} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, marginBottom: '0.2rem' }}>Age</label>
                <input type="text" className="input" value={patientAge} onChange={e => setPatientAge(e.target.value)} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, marginBottom: '0.2rem' }}>Gender</label>
                <select className="input" value={patientGender} onChange={e => setPatientGender(e.target.value)}>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Pediatric">Pediatric</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '1.25rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, marginBottom: '0.2rem' }}>Diagnosis / Indication</label>
                <input type="text" className="input" value={diagnosis} onChange={e => setDiagnosis(e.target.value)} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, marginBottom: '0.2rem' }}>Prescribing Physician</label>
                <input type="text" className="input" value={doctorName} onChange={e => setDoctorName(e.target.value)} />
              </div>
            </div>

            {/* Prescribed Items Line Editor */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>Prescribed Medicines ({items.length})</span>
              <button onClick={handleAddItem} className="btn btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <Plus size={14} />
                <span>Add Medicine Line</span>
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '420px', overflowY: 'auto' }}>
              {items.map((item, index) => (
                <div key={item.id} style={{ padding: '0.85rem', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--primary)' }}>#{index + 1} Medication</span>
                    <button onClick={() => handleRemoveItem(item.id)} style={{ border: 'none', background: 'none', color: 'var(--danger)', cursor: 'pointer' }}>
                      <Trash2 size={14} />
                    </button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: '0.4rem', marginBottom: '0.4rem' }}>
                    <input
                      type="text"
                      className="input"
                      placeholder="Medicine Brand"
                      value={item.medicineName}
                      onChange={e => handleUpdateItem(item.id, 'medicineName', e.target.value)}
                    />
                    <input
                      type="text"
                      className="input"
                      placeholder="Strength"
                      value={item.strength}
                      onChange={e => handleUpdateItem(item.id, 'strength', e.target.value)}
                    />
                    {/* Custom Practice Quantity */}
                    <input
                      type="text"
                      className="input"
                      placeholder="Qty (e.g. 10 tabs, 5 mL, 2 vials)"
                      value={item.quantity}
                      onChange={e => handleUpdateItem(item.id, 'quantity', e.target.value)}
                      title="Manual practice quantity: Enter any custom amount (e.g. 1 tablet, 5 mL, 20 units)"
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.4rem', marginBottom: '0.4rem' }}>
                    <select
                      className="input"
                      value={item.frequency}
                      onChange={e => handleUpdateItem(item.id, 'frequency', e.target.value)}
                    >
                      <option value="OD (Once Daily)">OD (Once Daily)</option>
                      <option value="BD (Twice Daily)">BD (Twice Daily)</option>
                      <option value="TDS (Three Times Daily)">TDS (Three Times Daily)</option>
                      <option value="QID (Four Times Daily)">QID (Four Times Daily)</option>
                      <option value="SOS (As Needed)">SOS (As Needed)</option>
                      <option value="HS (At Bedtime)">HS (At Bedtime)</option>
                      <option value="Stat (Immediately)">Stat (Immediately)</option>
                    </select>

                    <input
                      type="text"
                      className="input"
                      placeholder="Duration (e.g. 5 days)"
                      value={item.duration}
                      onChange={e => handleUpdateItem(item.id, 'duration', e.target.value)}
                    />

                    <select
                      className="input"
                      value={item.timing}
                      onChange={e => handleUpdateItem(item.id, 'timing', e.target.value)}
                    >
                      <option value="After Food">After Food</option>
                      <option value="Before Food">Before Food</option>
                      <option value="With Meals">With Meals</option>
                      <option value="Empty Stomach">Empty Stomach</option>
                    </select>
                  </div>

                  <input
                    type="text"
                    className="input"
                    placeholder="Pharmacist counseling instructions..."
                    value={item.instructions}
                    onChange={e => handleUpdateItem(item.id, 'instructions', e.target.value)}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Right Panel: Live Simulated Prescription Sheet (Printable) */}
          <div className="card" style={{ padding: '1.5rem', backgroundColor: '#fdfdfe' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a' }}>Simulated Rx Sheet Preview</span>
              <button onClick={handlePrint} className="btn btn-secondary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <Printer size={14} />
                <span>Print Rx Sheet</span>
              </button>
            </div>

            {/* Printable Prescription Layout */}
            <div
              id="printable-practice-rx"
              style={{
                border: '2px solid #0284c7',
                borderRadius: '8px',
                padding: '1.5rem',
                backgroundColor: '#ffffff',
                color: '#0f172a',
                boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
                position: 'relative'
              }}
            >
              {/* PRACTICE MODE WATERMARK */}
              <div
                style={{
                  position: 'absolute',
                  top: '40%',
                  left: '50%',
                  transform: 'translate(-50%, -50%) rotate(-30deg)',
                  fontSize: '2rem',
                  fontWeight: 900,
                  color: 'rgba(239, 68, 68, 0.12)',
                  pointerEvents: 'none',
                  textTransform: 'uppercase',
                  whiteSpace: 'nowrap',
                  letterSpacing: '3px'
                }}
              >
                PRACTICE MODE — NOT REAL RX
              </div>

              {/* Rx Header */}
              <div style={{ borderBottom: '2px solid #0284c7', paddingBottom: '0.75rem', marginBottom: '1rem' }}>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0284c7' }}>
                  NAVEED MEDICAL PHARMACY (NMP)
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  Clinical Practice & Dispensing Education Simulation • {doctorName}
                </div>
              </div>

              {/* Patient Info Bar */}
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', padding: '0.5rem 0', borderBottom: '1px solid #e2e8f0', fontSize: '0.8rem', marginBottom: '1rem' }}>
                <div>Patient: <strong>{patientName}</strong></div>
                <div>Age: <strong>{patientAge} yrs</strong></div>
                <div>Gender: <strong>{patientGender}</strong></div>
              </div>

              <div style={{ fontSize: '0.8rem', color: '#475569', marginBottom: '1rem' }}>
                Diagnosis: <strong style={{ color: '#0f172a' }}>{diagnosis}</strong>
              </div>

              {/* Rx Symbol & Items */}
              <div style={{ fontSize: '1.5rem', fontWeight: 900, fontFamily: 'serif', color: '#0284c7', marginBottom: '0.5rem' }}>
                ℞
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                {items.map((it, idx) => (
                  <div key={it.id} style={{ borderBottom: '1px dashed #cbd5e1', paddingBottom: '0.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem', fontWeight: 700 }}>
                      <span>{idx + 1}. {it.medicineName} {it.strength}</span>
                      <span style={{ color: '#0284c7' }}>Qty: {it.quantity}</span>
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#334155', marginTop: '0.15rem' }}>
                      Sig: {it.dose} — {it.frequency} for {it.duration} ({it.timing})
                    </div>
                    {it.instructions && (
                      <div style={{ fontSize: '0.72rem', color: '#64748b', fontStyle: 'italic', marginTop: '0.1rem' }}>
                        Note: {it.instructions}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Footer */}
              <div style={{ marginTop: '2rem', borderTop: '1px solid #e2e8f0', paddingTop: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.7rem', color: '#64748b' }}>
                <span>Simulated on: {new Date().toLocaleDateString()}</span>
                <span style={{ fontWeight: 700, color: '#ef4444' }}>MEDPRAC TRAINING PURPOSES ONLY</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 2: DOSAGE CALCULATION & PHARMACY PRACTICE QUIZZES     */}
      {/* ========================================================= */}
      {activeTab === 'quiz' && (
        <div className="card" style={{ padding: '1.75rem', maxWidth: '800px', margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Pharmacy Practice & Dosage Calculation Quiz</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                Test your knowledge of Latin prescription abbreviations, pediatric weight-based formulas, and food interactions.
              </p>
            </div>

            {showQuizResults && quizScore !== null && (
              <div style={{ padding: '0.5rem 1rem', borderRadius: 'var(--radius-md)', backgroundColor: quizScore === quizQuestions.length ? 'var(--success-light)' : 'var(--warning-light)', color: quizScore === quizQuestions.length ? 'var(--success-text)' : 'var(--warning-text)', fontWeight: 800 }}>
                Score: {quizScore} / {quizQuestions.length} ({Math.round((quizScore / quizQuestions.length) * 100)}%)
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {quizQuestions.map((q, qIndex) => {
              const selected = quizAnswers[q.id];
              const isCorrect = selected === q.correctAnswer;

              return (
                <div
                  key={q.id}
                  style={{
                    padding: '1.25rem',
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)'
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.75rem' }}>
                    Q{qIndex + 1}: {q.question}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    {q.options.map((opt, optIndex) => (
                      <label
                        key={optIndex}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          padding: '0.6rem 0.85rem',
                          borderRadius: 'var(--radius-sm)',
                          backgroundColor: selected === opt ? 'rgba(2, 132, 199, 0.08)' : 'transparent',
                          border: selected === opt ? '1px solid var(--primary)' : '1px solid transparent',
                          cursor: 'pointer',
                          fontSize: '0.85rem'
                        }}
                      >
                        <input
                          type="radio"
                          name={`quiz-q-${q.id}`}
                          value={opt}
                          checked={selected === opt}
                          onChange={() => setQuizAnswers({ ...quizAnswers, [q.id]: opt })}
                        />
                        <span>{opt}</span>
                      </label>
                    ))}
                  </div>

                  {showQuizResults && (
                    <div
                      style={{
                        marginTop: '0.75rem',
                        padding: '0.65rem 0.85rem',
                        borderRadius: 'var(--radius-sm)',
                        backgroundColor: isCorrect ? 'var(--success-light)' : 'var(--danger-light)',
                        color: isCorrect ? 'var(--success-text)' : 'var(--danger-text)',
                        fontSize: '0.8rem'
                      }}
                    >
                      <div style={{ fontWeight: 700, marginBottom: '0.2rem' }}>
                        {isCorrect ? '✓ Correct Answer!' : `✗ Incorrect (Correct: ${q.correctAnswer})`}
                      </div>
                      <div>{q.explanation}</div>
                    </div>
                  )}
                </div>
              );
            })}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button
                onClick={() => {
                  setQuizAnswers({});
                  setShowQuizResults(false);
                  setQuizScore(null);
                }}
                className="btn btn-secondary"
              >
                Reset Quiz
              </button>
              <button onClick={handleGradeQuiz} className="btn btn-primary">
                Submit & Check Answers
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 3: SAVED PRACTICE CASES                               */}
      {/* ========================================================= */}
      {activeTab === 'cases' && (
        <div className="card" style={{ padding: '1.5rem' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem' }}>
            Saved Practice Cases ({savedCases.length})
          </h2>

          {savedCases.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              No practice cases saved yet. Create a case in the Practice Prescription tab and click "Save Case".
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
              {savedCases.map(c => (
                <div key={c.id} style={{ padding: '1rem', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '0.95rem' }}>{c.title}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                      Physician: {c.doctorName} • Saved: {c.savedAt}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.4rem' }}>
                      {c.items.length} prescribed medication lines
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', borderTop: '1px solid var(--border)', paddingTop: '0.5rem' }}>
                    <button onClick={() => handleLoadCase(c)} className="btn btn-primary btn-sm">
                      Load in Builder
                    </button>
                    <button onClick={() => handleDeleteCase(c.id)} className="btn btn-secondary btn-sm" style={{ color: 'var(--danger)' }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
