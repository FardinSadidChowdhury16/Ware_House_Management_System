import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { queryClient } from "./queryClient.js";
import { AuthProvider } from "../../features/auth/context/AuthContext.jsx";
import { ToastProvider } from "../../shared/context/ToastContext.jsx";
import { ErrorBoundary } from "../../shared/components/ErrorBoundary.jsx";

export function AppProviders({ children }) {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <AuthProvider>{children}</AuthProvider>
        </ToastProvider>
        <ReactQueryDevtools initialIsOpen={false} />
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

