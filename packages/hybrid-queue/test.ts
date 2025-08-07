import { Queue, Worker } from './src/index';

// Create a test function to demonstrate the queue system
async function testHybridQueue() {
  console.log('🚀 Starting Hybrid Queue Test...');
  
  // Create a queue for email processing
  const emailQueue = new Queue('email');
  
  // Add some test jobs
  console.log('📧 Adding test jobs to the queue...');
  
  await emailQueue.add('welcome_email', {
    to: 'john@example.com',
    name: 'John Doe',
    template: 'welcome'
  });
  
  await emailQueue.add('notification_email', {
    to: 'admin@example.com',
    message: 'New user registered',
    priority: 'high'
  });
  
  await emailQueue.add('newsletter', {
    to: 'subscriber@example.com',
    subject: 'Weekly Newsletter',
    content: 'Latest updates...'
  });
  
  // Add a job that will fail to test retry logic
  await emailQueue.add('failing_job', {
    to: 'test@example.com',
    shouldFail: true
  });
  
  console.log('✅ Jobs added successfully!');
  
  // Create a worker to process the jobs
  const worker = new Worker('email', async (job) => {
    console.log(`\n🔄 Processing job ${job.id}: ${job.name}`);
    console.log(`📊 Attempt: ${job.attempts + 1}`);
    console.log(`📋 Data:`, job.data);
    
    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Simulate failure for testing retry logic
    if (job.data.shouldFail && job.attempts < 2) {
      throw new Error('Simulated job failure for testing');
    }
    
    // Process different job types
    switch (job.name) {
      case 'welcome_email':
        console.log(`📨 Sending welcome email to ${job.data.to}`);
        break;
      case 'notification_email':
        console.log(`🔔 Sending notification: ${job.data.message}`);
        break;
      case 'newsletter':
        console.log(`📰 Sending newsletter to ${job.data.to}`);
        break;
      case 'failing_job':
        console.log(`🔧 Processing previously failed job for ${job.data.to}`);
        break;
      default:
        console.log(`📤 Processing generic email job`);
    }
    
    console.log(`✅ Job ${job.id} completed successfully!`);
  });
  
  console.log('\n👷 Worker started, processing jobs...');
  console.log('⏱️  Polling every 1 second for new jobs');
  
  // Let the worker process jobs for a while
  await new Promise(resolve => setTimeout(resolve, 8000));
  
  // Check worker status
  const status = worker.getStatus();
  console.log(`\n📊 Worker Status:`, status);
  
  // Graceful shutdown
  console.log('\n🛑 Shutting down worker...');
  worker.close();
  
  console.log('✨ Test completed successfully!');
  console.log('\n📝 Summary:');
  console.log('- Created email queue');
  console.log('- Added 4 test jobs (including one that fails initially)');
  console.log('- Worker processed jobs with retry logic');
  console.log('- Demonstrated graceful shutdown');
}

// Handle process termination gracefully
process.on('SIGINT', () => {
  console.log('\n🛑 Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

// Run the test
testHybridQueue().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});