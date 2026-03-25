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
import { processScheduled, retryFailed } from '../services/notificationCampaignService.js';

let schedulerInitialized = false;

/**
 * Initialize push notification scheduler
 * Runs two cron jobs:
 * 1. Process scheduled notifications every minute
 * 2. Retry failed notifications every 5 minutes
 */
export const initializePushNotificationScheduler = () => {
  if (schedulerInitialized) {
    return;
  }

  try {
    // Process scheduled notifications every minute
    cron.schedule('*/1 * * * *', async () => {
      try {
        const result = await processScheduled();
      } catch (error: unknown) {
        console.error('[Push Notification Scheduler] Error processing scheduled notifications:', error);
      }
    });

    // Retry failed notifications every 5 minutes
    cron.schedule('*/5 * * * *', async () => {
      try {
        const result = await retryFailed();
        if (result.retried > 0) {

        }
      } catch (error: unknown) {
        console.error('[Push Notification Scheduler] Error retrying failed notifications:', error);
      }
    });



    schedulerInitialized = true;
  } catch (error: unknown) {
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
