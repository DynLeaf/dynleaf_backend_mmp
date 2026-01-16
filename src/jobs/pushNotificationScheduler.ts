/**
 * Push Notification Scheduler
 * Handles scheduled notification processing and retries
 * 
 * To use this, add to your main server file:
 * 
 * import { initializePushNotificationScheduler } from 'src/jobs/pushNotificationScheduler';
 * initializePushNotificationScheduler();
 */

import cron from 'node-cron';
import { processScheduledNotifications, retryFailedNotifications } from '../services/pushNotificationService.js';

let schedulerInitialized = false;

/**
 * Initialize push notification scheduler
 * Runs two cron jobs:
 * 1. Process scheduled notifications every minute
 * 2. Retry failed notifications every 5 minutes
 */
export const initializePushNotificationScheduler = () => {
  if (schedulerInitialized) {
    console.log('Push notification scheduler already initialized');
    return;
  }

  try {
    // Process scheduled notifications every minute
    cron.schedule('*/1 * * * *', async () => {
      try {
        console.log('[Push Notification Scheduler] Processing scheduled notifications...');
        const result = await processScheduledNotifications();
        if (result.processed > 0) {
          console.log(
            `[Push Notification Scheduler] Successfully processed ${result.processed} scheduled notifications`
          );
        }
      } catch (error: any) {
        console.error('[Push Notification Scheduler] Error processing scheduled notifications:', error);
      }
    });

    // Retry failed notifications every 5 minutes
    cron.schedule('*/5 * * * *', async () => {
      try {
        console.log('[Push Notification Scheduler] Processing failed notifications for retry...');
        const result = await retryFailedNotifications();
        if (result.retried > 0) {
          console.log(
            `[Push Notification Scheduler] Successfully retried ${result.retried} out of ${result.attempted} failed notifications`
          );
        }
      } catch (error: any) {
        console.error('[Push Notification Scheduler] Error retrying failed notifications:', error);
      }
    });

    // Health check - log every 10 minutes
    cron.schedule('*/10 * * * *', () => {
      console.log('[Push Notification Scheduler] Health check - scheduler is running');
    });

    schedulerInitialized = true;
    console.log('[Push Notification Scheduler] Successfully initialized');
  } catch (error: any) {
    console.error('[Push Notification Scheduler] Failed to initialize:', error);
    throw error;
  }
};

/**
 * Stop the scheduler (useful for testing or graceful shutdown)
 */
export const stopPushNotificationScheduler = () => {
  if (schedulerInitialized) {
    cron.getTasks().forEach(task => {
      task.stop();
    });
    schedulerInitialized = false;
    console.log('[Push Notification Scheduler] Scheduler stopped');
  }
};

/**
 * Get scheduler status
 */
export const getPushNotificationSchedulerStatus = () => {
  return {
    initialized: schedulerInitialized,
    tasks: cron.getTasks().size,
    status: schedulerInitialized ? 'active' : 'inactive',
  };
};

export default {
  initializePushNotificationScheduler,
  stopPushNotificationScheduler,
  getPushNotificationSchedulerStatus,
};
