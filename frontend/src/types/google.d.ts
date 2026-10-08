declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: {
          initialize: (config: {
            client_id: string;
            ux_mode?: 'popup' | 'redirect';
            callback: (response: { credential: string; select_by?: string; state?: string }) => void;
            auto_select?: boolean;
            cancel_on_tap_outside?: boolean;
            use_fedcm_for_button?: boolean;
            button_auto_select?: boolean;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              type?: 'standard' | 'icon';
              theme?: 'outline' | 'filled_blue' | 'filled_black';
              size?: 'large' | 'medium' | 'small';
              text?: 'signin_with' | 'signup_with' | 'continue_with';
              shape?: 'rectangular' | 'pill' | 'circle' | 'square';
              logo_alignment?: 'left' | 'center';
              width?: number | string;
              locale?: string;
              state?: string;
              click_listener?: () => void;
            }
          ) => void;
          prompt: (momentListener?: (notification: any) => void) => void;
          revoke: (hint: string, done?: () => void) => void;
        };
      };
    };
  }
}

export {};
