import { Request, Response } from 'express';
import { printReceiptESC_POS } from './receiptPrinterEngine.js';

interface PrintJob {
  id: string;
  invoiceNumber?: string;
  printerName?: string;
  invoiceData?: any;
  createdAt: number;
}

// In-memory queue on Fly.io / cloud server
let pendingJobs: PrintJob[] = [];
let waitingPollRes: Response | null = null;
let pollTimeout: NodeJS.Timeout | null = null;
let lastHeartbeatTime = 0;
let completedJobs = new Map<string, { success: boolean; message?: string }>();

const RELAY_SECRET = process.env.PRINTER_RELAY_SECRET || 'nmp-speedx-relay-2026';
const CLOUD_URL = process.env.CLOUD_API_URL || 'https://nmp-api.fly.dev';

/**
 * Handles long-poll request from the local Windows laptop agent.
 * Keeps connection open for up to 20 seconds, or responds immediately when a print job is queued.
 */
export function handleRelayPoll(req: Request, res: Response) {
  const secret = req.query.secret || req.headers['x-printer-secret'];
  if (secret !== RELAY_SECRET) {
    return res.status(403).json({ error: 'Unauthorized printer relay access' });
  }

  lastHeartbeatTime = Date.now();

  // If there's already a pending job, return it immediately
  if (pendingJobs.length > 0) {
    const job = pendingJobs.shift();
    return res.json({ hasJob: true, job });
  }

  // Otherwise hold response open for up to 20 seconds
  if (waitingPollRes && !waitingPollRes.writableEnded) {
    try { waitingPollRes.json({ hasJob: false, timeout: true }); } catch {}
  }
  if (pollTimeout) {
    clearTimeout(pollTimeout);
  }

  waitingPollRes = res;

  pollTimeout = setTimeout(() => {
    if (waitingPollRes === res && !res.writableEnded) {
      waitingPollRes = null;
      res.json({ hasJob: false, timeout: true });
    }
  }, 20000);

  req.on('close', () => {
    if (waitingPollRes === res) {
      waitingPollRes = null;
    }
  });
}

/**
 * Handles acknowledgment when the local laptop finishes printing a job
 */
export function handleRelayAck(req: Request, res: Response) {
  const secret = req.query.secret || req.headers['x-printer-secret'];
  if (secret !== RELAY_SECRET) {
    return res.status(403).json({ error: 'Unauthorized printer relay access' });
  }

  const { jobId, success, message } = req.body;
  if (jobId) {
    completedJobs.set(jobId, { success: !!success, message });
    // Keep map small
    if (completedJobs.size > 100) {
      const firstKey = completedJobs.keys().next().value;
      if (firstKey) completedJobs.delete(firstKey);
    }
  }

  lastHeartbeatTime = Date.now();
  res.json({ acknowledged: true });
}

/**
 * Checks if the local hardware printer relay agent is currently connected and active
 */
export function isRelayAgentOnline(): boolean {
  // Considered online if a poll was received in the last 35 seconds
  return (Date.now() - lastHeartbeatTime) < 35000;
}

/**
 * Enqueues a print job to be executed by the local Windows laptop agent.
 * Waits up to 3 seconds for acknowledgment.
 */
export async function dispatchPrintJobViaRelay(payload: {
  invoiceNumber?: string;
  printerName?: string;
  invoiceData?: any;
}): Promise<{ success: boolean; message: string }> {
  if (!isRelayAgentOnline()) {
    return {
      success: false,
      message: 'Local Speed-X 400UL agent is offline on the pharmacy laptop. Please ensure local server is running.'
    };
  }

  const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const job: PrintJob = {
    id: jobId,
    invoiceNumber: payload.invoiceNumber,
    printerName: payload.printerName || 'Speed-X 400UL',
    invoiceData: payload.invoiceData,
    createdAt: Date.now()
  };

  // If a poll is currently waiting, dispatch immediately
  if (waitingPollRes && !waitingPollRes.writableEnded) {
    const res = waitingPollRes;
    waitingPollRes = null;
    if (pollTimeout) clearTimeout(pollTimeout);
    res.json({ hasJob: true, job });
  } else {
    pendingJobs.push(job);
  }

  // Wait up to 3 seconds for local agent acknowledgment
  const startTime = Date.now();
  while (Date.now() - startTime < 3500) {
    if (completedJobs.has(jobId)) {
      const ack = completedJobs.get(jobId)!;
      completedJobs.delete(jobId);
      return {
        success: ack.success,
        message: ack.message || (ack.success ? 'Receipt printed & cut automatically on Speed-X 400UL!' : 'Hardware print failed')
      };
    }
    await new Promise(r => setTimeout(r, 200));
  }

  // If no explicit ack yet but job was dispatched, assume queued
  return {
    success: true,
    message: 'Receipt sent to Speed-X 400UL hardware printer!'
  };
}

/**
 * Client-side agent poller running on the local Windows laptop.
 * Connects outbound to Fly.io cloud backend to listen for print jobs.
 */
let agentRunning = false;

export function startLocalLaptopRelayAgent() {
  if (process.platform !== 'win32') {
    // Only runs on the local Windows laptop where the printer is connected
    return;
  }

  if (agentRunning) return;
  agentRunning = true;

  console.log(`[cloudPrinterRelay] Starting local Speed-X 400UL agent polling: ${CLOUD_URL}/api/integrations/printer-relay/poll`);

  (async () => {
    while (agentRunning) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 25000);

        const pollUrl = `${CLOUD_URL}/api/integrations/printer-relay/poll?secret=${encodeURIComponent(RELAY_SECRET)}`;
        const res = await fetch(pollUrl, { signal: controller.signal });
        clearTimeout(timer);

        if (res.ok) {
          const data: any = await res.json();
          if (data && data.hasJob && data.job) {
            console.log(`[cloudPrinterRelay] Received remote print job: ${data.job.id} for invoice ${data.job.invoiceNumber || 'data'}`);

            try {
              const printRes = await printReceiptESC_POS({
                invoiceNumber: data.job.invoiceNumber,
                printerName: data.job.printerName || 'Speed-X 400UL',
                invoiceData: data.job.invoiceData
              });

              // Send Ack back to cloud
              await fetch(`${CLOUD_URL}/api/integrations/printer-relay/ack?secret=${encodeURIComponent(RELAY_SECRET)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  jobId: data.job.id,
                  success: printRes.success,
                  message: printRes.success
                    ? `Receipt printed & cut on ${printRes.printerName || 'Speed-X 400UL'}`
                    : printRes.reason
                })
              });
            } catch (err: any) {
              console.error('[cloudPrinterRelay] Error printing job:', err);
              await fetch(`${CLOUD_URL}/api/integrations/printer-relay/ack?secret=${encodeURIComponent(RELAY_SECRET)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  jobId: data.job.id,
                  success: false,
                  message: err.message
                })
              });
            }
          }
        } else {
          // Wait 3 seconds on error
          await new Promise(r => setTimeout(r, 3000));
        }
      } catch {
        // Wait 3 seconds on network error or abort
        await new Promise(r => setTimeout(r, 3000));
      }
    }
  })();
}
