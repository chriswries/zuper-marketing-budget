/**
 * CloudDataRealtimeManager
 * 
 * Manages realtime subscriptions for cache invalidation.
 * Starts subscriptions when user is authenticated, stops on sign-out.
 * Renders nothing - just manages side effects.
 */

import { useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { subscribeForecastRealtimeInvalidation } from '@/lib/forecastStore';
import { subscribeActualsRealtimeInvalidation } from '@/lib/actualsStore';
import { subscribeActualsMatchingRealtimeInvalidation } from '@/lib/actualsMatchingStore';
import { subscribeVendorRegistryRealtimeInvalidation } from '@/lib/vendorRegistryStore';

export function CloudDataRealtimeManager() {
  const { session } = useAuth();
  const cleanupRef = useRef<(() => void)[]>([]);

  useEffect(() => {
    // Only subscribe when authenticated
    if (!session) {
      return;
    }

    // Start all realtime subscriptions
    const forecastCleanup = subscribeForecastRealtimeInvalidation();
    const actualsCleanup = subscribeActualsRealtimeInvalidation();
    const matchingCleanup = subscribeActualsMatchingRealtimeInvalidation();
    const vendorRegistryCleanup = subscribeVendorRegistryRealtimeInvalidation();

    cleanupRef.current = [forecastCleanup, actualsCleanup, matchingCleanup, vendorRegistryCleanup];

    // Cleanup on unmount or session change
    return () => {
      cleanupRef.current.forEach((cleanup) => cleanup());
      cleanupRef.current = [];
    };
  }, [session]);

  // This component renders nothing
  return null;
}
