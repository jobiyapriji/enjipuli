import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Resend } from 'resend';
import bcrypt from 'bcryptjs';
import { validateStudentEmail } from '@/lib/collegeEmail';

const resend = new Resend(process.env.RESEND_API_KEY || 're_dummy_key');

const VENDOR_ALLOWLIST = [
  'vendor@enjipuli.com',
  ...(process.env.VENDOR_EMAILS?.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean) || []),
];

// In-memory sliding window IP rate limiter (max 10 requests per 15 minutes per IP)
const ipRequestWindowMap = new Map<string, number[]>();

function checkIpRateLimit(ip: string, maxRequests = 10, windowMs = 15 * 60 * 1000): boolean {
  const now = Date.now();
  const windowStart = now - windowMs;
  const timestamps = (ipRequestWindowMap.get(ip) || []).filter((t) => t > windowStart);

  if (timestamps.length >= maxRequests) {
    ipRequestWindowMap.set(ip, timestamps);
    return false;
  }

  timestamps.push(now);
  ipRequestWindowMap.set(ip, timestamps);

  // Periodic cleanup if map grows
  if (ipRequestWindowMap.size > 10000) {
    for (const [key, times] of ipRequestWindowMap.entries()) {
      const active = times.filter((t) => t > windowStart);
      if (active.length === 0) {
        ipRequestWindowMap.delete(key);
      } else {
        ipRequestWindowMap.set(key, active);
      }
    }
  }

  return true;
}

function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0].trim();
    if (first) return first;
  }
  const realIp = req.headers.get('x-real-ip');
  if (realIp && realIp.trim()) return realIp.trim();
  const cfIp = req.headers.get('cf-connecting-ip');
  if (cfIp && cfIp.trim()) return cfIp.trim();
  return '127.0.0.1';
}

export async function POST(req: Request) {
  try {
    const clientIp = getClientIp(req);

    // 1. Per-IP Rate Limiting (max 10 requests per 15 minutes across any emails)
    if (!checkIpRateLimit(clientIp)) {
      return NextResponse.json(
        { error: 'Too many requests from this network. Please try again in 15 minutes.' },
        { status: 429 }
      );
    }

    const { email: rawEmail, purpose } = await req.json();

    if (!rawEmail || !purpose) {
      return NextResponse.json({ error: 'Email and purpose are required.' }, { status: 400 });
    }

    const email = rawEmail.trim().toLowerCase();

    // 2. Strict Input & Role Validation
    if (purpose === 'student') {
      const validation = validateStudentEmail(email);
      if (!validation.valid) {
        return NextResponse.json(
          { error: validation.error || 'Please enter a valid email address.' },
          { status: 400 }
        );
      }

      // Safeguard: Vendor accounts cannot use the student portal
      if (VENDOR_ALLOWLIST.includes(email)) {
        return NextResponse.json(
          { error: 'Vendor accounts must sign in through the Vendor Portal.' },
          { status: 400 }
        );
      }
    } else if (purpose === 'vendor') {
      if (!VENDOR_ALLOWLIST.includes(email)) {
        return NextResponse.json(
          { error: 'Not an authorized vendor email.' },
          { status: 403 }
        );
      }
    } else {
      return NextResponse.json({ error: 'Invalid purpose.' }, { status: 400 });
    }

    // 3. Per-Email Rate Limiting (max 3 requests per 15 minutes)
    // Count ALL OTPs for this email in the last 15 min to prevent abuse
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    const recentRequests = await prisma.otpCode.count({
      where: {
        email,
        createdAt: { gte: fifteenMinutesAgo },
      },
    });

    if (recentRequests >= 3) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again in 15 minutes.' },
        { status: 429 }
      );
    }

    // 4. Invalidate old UNCONSUMED OTPs for this email+purpose
    // Use updateMany to soft-expire instead of deleteMany, preserving rate-limit history.
    await prisma.otpCode.updateMany({
      where: { email, purpose, consumedAt: null },
      data: { expiresAt: new Date() },  // expire them immediately
    });

    // 5. Generate 6-digit code & Hash
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const salt = await bcrypt.genSalt(10);
    const codeHash = await bcrypt.hash(code, salt);
    
    // 5-minute expiry
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await prisma.otpCode.create({
      data: {
        email,
        codeHash,
        purpose,
        expiresAt,
      },
    });

    // 6. Send Email via Resend
    const hasEmailService = Boolean(
      process.env.RESEND_API_KEY && process.env.RESEND_API_KEY !== 're_dummy_key'
    );

    if (!hasEmailService) {
      console.log(`\n\n=== OTP GENERATED FOR ${email} ===\nCODE: ${code}\n===============================\n`);
      return NextResponse.json({
        success: true,
        previewCode: code,
        message: 'Email service not configured. Test preview code provided.',
      });
    }

    const fromAddress = process.env.RESEND_FROM_EMAIL || 'ENJIPULI <onboarding@resend.dev>';

    try {
      const sendResult = await resend.emails.send({
        from: fromAddress,
        to: email,
        subject: 'Your ENJIPULI login code',
        html: `
          <div style="font-family: sans-serif; background-color: #0f172a; color: #f8fafc; padding: 40px; text-align: center; border-radius: 8px;">
            <h1 style="color: #a3e635; margin-bottom: 8px;">ENJIPULI</h1>
            <p style="font-size: 16px; margin-bottom: 24px;">Your login code is below. It will expire in 5 minutes.</p>
            <div style="font-size: 32px; font-weight: bold; letter-spacing: 4px; padding: 20px; background-color: #1e293b; display: inline-block; border-radius: 8px; border: 1px solid #334155;">
              ${code}
            </div>
          </div>
        `,
      });

      if (sendResult.error) {
        console.warn('Resend email delivery error:', sendResult.error);
        // Fallback: provide previewCode so developer/user is never locked out due to Resend domain/account restrictions
        return NextResponse.json({
          success: true,
          previewCode: code,
          emailError: sendResult.error.message,
        });
      }

      return NextResponse.json({ success: true });
    } catch (emailErr: any) {
      console.error('Resend delivery exception:', emailErr);
      return NextResponse.json({
        success: true,
        previewCode: code,
        emailError: emailErr?.message || 'Email delivery failed',
      });
    }
  } catch (error: any) {
    console.error('OTP Request Error:', error);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
