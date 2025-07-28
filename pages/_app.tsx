import '../styles/globals.css';
import type { AppProps } from 'next/app';
import { useRouter } from 'next/router';
import ProtectedRoute from '../components/ProtectedRoute';

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();
  
  // Pages that don't require authentication
  const publicPages = ['/login', '/setup'];
  const isPublicPage = publicPages.includes(router.pathname);

  if (isPublicPage) {
    return <Component {...pageProps} />;
  }

  return (
    <ProtectedRoute>
      <div className="container">
        <Component {...pageProps} />
      </div>
    </ProtectedRoute>
  );
}