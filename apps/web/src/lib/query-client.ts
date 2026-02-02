import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";

/**
 * Global QueryClient configuration
 * Handles errors and retries consistently across the app
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 60 * 1000, // 1 minute - reasonable default for most data
    },
  },
  queryCache: new QueryCache({
    onError: (error) => {
      // Global query error handler
      // You can add toast notifications here
      console.error("Query error:", error.message);
    },
  }),
  mutationCache: new MutationCache({
    onError: (error) => {
      // Global mutation error handler
      // You can add toast notifications here
      console.error("Mutation error:", error.message);
    },
  }),
});
