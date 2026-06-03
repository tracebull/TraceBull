import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';

import { Spinner } from '../components/ui/spinner';

import { getOAuthRedirectUri } from '../constants';
import { userApi } from '../entity/users';

export function OAuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string>('');

  useEffect(() => {
    const handleOAuthCallback = async () => {
      const code = searchParams.get('code');
      const state = searchParams.get('state');

      if (!code) {
        setError('Authorization code not found');
        return;
      }

      if (!state) {
        setError('OAuth state parameter missing');
        return;
      }

      const redirectUri = getOAuthRedirectUri();

      try {
        if (state === 'github') {
          await userApi.handleGitHubOAuth({ code, redirectUri });
        } else if (state === 'google') {
          await userApi.handleGoogleOAuth({ code, redirectUri });
        } else if (state === 'microsoft') {
          await userApi.handleMicrosoftOAuth({ code, redirectUri });
        } else {
          setError('Invalid OAuth provider');
          return;
        }

        navigate('/');
      } catch (e) {
        setError((e as Error).message || 'OAuth authentication failed');
      }
    };

    handleOAuthCallback();
  }, [searchParams, navigate]);

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center">
      {error ? (
        <div>
          <div className="mb-4 text-center text-xl font-semibold text-red-600">
            Authentication Failed
          </div>
          <div className="text-muted-foreground text-center text-sm">{error}</div>
          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="text-primary hover:text-primary/80 cursor-pointer font-medium"
            >
              Return to sign in
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center">
          <Spinner size="lg" />
          <div className="text-muted-foreground mt-4">Completing authentication...</div>
        </div>
      )}
    </div>
  );
}
