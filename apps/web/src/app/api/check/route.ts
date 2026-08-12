import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function GET() {
  try {
    const { stdout, stderr } = await execAsync('pnpm run build', { cwd: 'd:\\AIIMS KALYANI WORK\\OPD_Queue_Management\\apps\\api' });
    return NextResponse.json({ stdout, stderr });
  } catch (error: any) {
    return NextResponse.json({ error: error.message, stdout: error.stdout, stderr: error.stderr }, { status: 500 });
  }
}
