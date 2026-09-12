import { Response } from 'express';

export interface QrPaymentEvent {
  id: string;
  provider: 'JAZZCASH' | 'AL_HABIB' | 'MEEZAN' | 'NAYAPAY' | 'RAAST' | 'EASYPAISA' | 'OTHER';
  amount: number;
  trxId: string;
  senderMobile?: string;
  rawText?: string;
  timestamp: string;
  status: 'PENDING' | 'MATCHED' | 'PROCESSED';
}

// In-memory list of active SSE clients connected to POS
const sseClients: Set<Response> = new Set();

// Recent received payments buffer
const recentPayments: QrPaymentEvent[] = [];

export function registerSseClient(res: Response) {
  sseClients.add(res);
  res.on('close', () => {
    sseClients.delete(res);
  });
}

export function broadcastPaymentEvent(event: QrPaymentEvent) {
  recentPayments.unshift(event);
  if (recentPayments.length > 50) recentPayments.pop();

  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(data);
    } catch {
      sseClients.delete(client);
    }
  }
}

export function getRecentQrPayments(): QrPaymentEvent[] {
  return [...recentPayments];
}

/**
 * Intelligent parser for Pakistani Mobile Banking SMS notifications
 */
export function parseSmsNotification(smsBody: string, sender: string = ''): Partial<QrPaymentEvent> {
  const text = smsBody.trim();
  let amount = 0;
  let trxId = 'TRX-' + Math.floor(100000 + Math.random() * 900000);
  let provider: QrPaymentEvent['provider'] = 'OTHER';

  const lower = text.toLowerCase();
  const lowerSender = sender.toLowerCase();

  if (lowerSender.includes('meezan') || lower.includes('meezan') || lower.includes('02390106273209')) {
    provider = 'MEEZAN';
  } else if (lowerSender.includes('nayapay') || lower.includes('nayapay')) {
    provider = 'NAYAPAY';
  } else if (lowerSender.includes('8558') || lower.includes('jazzcash')) {
    provider = 'JAZZCASH';
  } else if (lowerSender.includes('8188') || lower.includes('al habib') || lower.includes('alhabib')) {
    provider = 'AL_HABIB';
  } else if (lowerSender.includes('3737') || lower.includes('easypaisa')) {
    provider = 'EASYPAISA';
  } else if (lower.includes('raast')) {
    provider = 'RAAST';
  }

  // Extract amount: patterns like Rs. 500, Rs 500.00, PKR 500, received 500
  const amountMatch = text.match(/(?:Rs\.?|PKR|received|credited\s+with)\s*:?\s*([0-9]+(?:\.[0-9]{1,2})?)/i) 
    || text.match(/([0-9]+(?:\.[0-9]{1,2})?)\s*(?:Rs|PKR)/i);
  
  if (amountMatch && amountMatch[1]) {
    amount = parseFloat(amountMatch[1]);
  }

  // Extract Trx / TID / Ref ID: patterns like TID: 123456, Trx ID: 123456, Ref: 123456
  const trxMatch = text.match(/(?:TID|Trx\s*ID|Txn\s*ID|Ref\s*(?:No|ID)?)\s*:?\s*([A-Za-z0-9]+)/i);
  if (trxMatch && trxMatch[1]) {
    trxId = trxMatch[1];
  }

  return {
    provider,
    amount,
    trxId,
    rawText: text
  };
}
