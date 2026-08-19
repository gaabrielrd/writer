import { useEffect } from 'react';
import { env } from '@/shared/config';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
            auto_select?: boolean;
            cancel_on_tap_outside?: boolean;
          }) => void;
          prompt: (
            callback?: (notification: {
              isNotDisplayed: () => boolean;
              isSkippedMoment: () => boolean;
              isDismissedMoment: () => boolean;
            }) => void,
          ) => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              type?: 'standard' | 'icon';
              theme?: 'outline' | 'filled_blue' | 'filled_black';
              size?: 'large' | 'medium' | 'small';
              text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
              shape?: 'rectangular' | 'pill' | 'circle' | 'square';
              logo_alignment?: 'left' | 'center';
              width?: string | number;
              locale?: string;
            },
          ) => void;
        };
      };
    };
  }
}

export function useGoogleOneTap({
  onSuccess,
  onError,
  disabled = false,
}: {
  onSuccess: (idToken: string) => void | Promise<void>;
  onError?: (err: Error) => void;
  disabled?: boolean;
}) {
  useEffect(() => {
    if (disabled || typeof window === 'undefined') return;

    const clientId =
      env.firebase.googleClientId ||
      '404822288771-uvpfno7e3ianqfkls677tflqhviujk19.apps.googleusercontent.com';

    let isMounted = true;

    function initOneTap() {
      if (!window.google?.accounts?.id || !isMounted) return;

      try {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (response) => {
            if (response.credential && isMounted) {
              void onSuccess(response.credential);
            }
          },
          auto_select: false,
          cancel_on_tap_outside: true,
        });

        window.google.accounts.id.prompt();
      } catch (err) {
        if (onError && err instanceof Error) {
          onError(err);
        }
      }
    }

    if (window.google?.accounts?.id) {
      initOneTap();
    } else {
      const existingScript = document.querySelector(
        'script[src="https://accounts.google.com/gsi/client"]',
      );
      if (!existingScript) {
        const script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.defer = true;
        script.onload = () => {
          if (isMounted) initOneTap();
        };
        document.head.appendChild(script);
      } else {
        existingScript.addEventListener('load', () => {
          if (isMounted) initOneTap();
        });
      }
    }

    return () => {
      isMounted = false;
    };
  }, [disabled, onSuccess, onError]);
}
