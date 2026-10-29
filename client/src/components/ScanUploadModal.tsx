import React, { useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { Camera, Upload, X, FileText, Loader2 } from 'lucide-react';

interface PendingFile {
  file: File;
  previewUrl: string | null;
}

interface ScanUploadModalProps {
  title?: string;
  // When scanId is provided, files are appended as extra pages to that existing draft
  // (POST /:id/pages). Otherwise a brand-new scan is created (POST /).
  scanId?: number;
  onClose: () => void;
  onCreated: (scanId: number) => void;
  onAppended?: () => void;
}

export const ScanUploadModal: React.FC<ScanUploadModalProps> = ({ title, scanId, onClose, onCreated, onAppended }) => {
  const { token } = useAuth();
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const next: PendingFile[] = Array.from(list).map(file => ({
      file,
      previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : null
    }));
    setFiles(prev => [...prev, ...next]);
  };

  const removeFile = (idx: number) => {
    setFiles(prev => {
      const target = prev[idx];
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const handleSubmit = async () => {
    if (files.length === 0) {
      setError('Add at least one photo, scan, or PDF page first.');
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const formData = new FormData();
      files.forEach(f => formData.append('files', f.file));

      const url = scanId ? `/api/purchases/scans/${scanId}/pages` : '/api/purchases/scans';
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Upload failed');
        setIsSubmitting(false);
        return;
      }

      files.forEach(f => f.previewUrl && URL.revokeObjectURL(f.previewUrl));

      if (scanId) {
        onAppended?.();
      } else {
        onCreated(data.scanId);
      }
    } catch (err: any) {
      setError(err.message || 'Network error while uploading');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '640px' }}>
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Camera size={20} style={{ color: 'var(--primary)' }} />
            <span>{title || 'Scan Invoice'}</span>
          </h3>
          <button onClick={onClose} className="btn btn-secondary btn-sm" style={{ padding: '0.3rem' }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Capture or upload one or more pages/photos of the supplier invoice. You can add more before submitting.
          </p>

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-secondary" onClick={() => cameraInputRef.current?.click()}>
              <Camera size={16} />
              <span>Take Photo</span>
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => fileInputRef.current?.click()}>
              <Upload size={16} />
              <span>Upload Files / PDF</span>
            </button>
          </div>

          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            style={{ display: 'none' }}
            onChange={e => { addFiles(e.target.files); e.target.value = ''; }}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            multiple
            style={{ display: 'none' }}
            onChange={e => { addFiles(e.target.files); e.target.value = ''; }}
          />

          {files.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: '0.6rem' }}>
              {files.map((f, idx) => (
                <div key={idx} style={{ position: 'relative', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden', height: '90px', background: 'var(--bg-app)' }}>
                  {f.previewUrl ? (
                    <img src={f.previewUrl} alt={f.file.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.25rem', padding: '0.25rem' }}>
                      <FileText size={22} style={{ color: 'var(--text-muted)' }} />
                      <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textAlign: 'center', wordBreak: 'break-all' }}>{f.file.name}</span>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => removeFile(idx)}
                    style={{ position: 'absolute', top: '2px', right: '2px', background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: '50%', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                  >
                    <X size={12} color="#fff" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {error && (
            <div style={{ padding: '0.6rem 0.85rem', background: 'var(--danger-light)', color: 'var(--danger-text)', borderRadius: 'var(--radius-md)', fontSize: '0.82rem' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.25rem' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isSubmitting}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={isSubmitting || files.length === 0}>
              {isSubmitting ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
              <span>{isSubmitting ? 'Uploading...' : scanId ? 'Add Pages' : 'Scan Invoice'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
