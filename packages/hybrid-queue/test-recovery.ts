import { Queue, Worker } from './src/index';
import { Database } from 'bun:sqlite';
import path from 'path';

// Test script to verify job recovery functionality
async function testJobRecovery() {
  console.log('🧪 Testing Job Recovery Functionality...');
  
  const testDbPath = path.join(process.cwd(), 'test-recovery.sqlite');
  
  // Clean up any existing test database
  try {
    const fs = require('fs');
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  } catch (error) {
    // Ignore if file doesn't exist
  }
  
  // Create a test queue
  const testQueue = new Queue('test-recovery');
  
  // Add some test jobs
  console.log('📝 Adding test jobs...');
  await testQueue.add('test-job-1', { message: 'Test job 1' });
  await testQueue.add('test-job-2', { message: 'Test job 2' });
  await testQueue.add('test-job-3', { message: 'Test job 3' });
  
  // Manually mark some jobs as processing (simulating interrupted processing)
  console.log('⚡ Simulating interrupted processing jobs...');
  const jobs = testQueue.getJobs('waiting');
  if (jobs.length >= 2) {
    testQueue.updateJobStatus(jobs[0].id, 'processing');
    testQueue.updateJobStatus(jobs[1].id, 'processing');
  }
  
  // Check stats before recovery
  console.log('📊 Stats before recovery:');
  const statsBefore = testQueue.getStats();
  console.log(statsBefore);
  
  // Close the queue to simulate app shutdown
  testQueue.close();
  
  // Create a new worker (simulating app restart)
  console.log('🔄 Simulating app restart with new worker...');
  const worker = new Worker('test-recovery', async (job) => {
    console.log(`Processing job ${job.id}: ${job.data.message}`);
    // Simulate some work
    await new Promise(resolve => setTimeout(resolve, 100));
  });
  
  // Wait a moment for recovery to complete
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Check stats after recovery
  console.log('📊 Stats after recovery:');
  const statsAfter = worker['queue'].getStats();
  console.log(statsAfter);
  
  // Verify recovery worked
  if (statsAfter.processing === 0 && statsAfter.waiting > 0) {
    console.log('✅ Recovery test PASSED: All processing jobs were reset to waiting');
  } else {
    console.log('❌ Recovery test FAILED: Some jobs are still in processing state');
  }
  
  // Wait for jobs to be processed
  console.log('⏳ Waiting for jobs to be processed...');
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Final stats
  console.log('📊 Final stats:');
  const finalStats = worker['queue'].getStats();
  console.log(finalStats);
  
  // Cleanup
  worker.close();
  
  console.log('🎉 Job recovery test completed!');
}

// Run the test
testJobRecovery().catch(console.error);