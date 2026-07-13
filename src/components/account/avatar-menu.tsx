import { Link, useRouter } from '@tanstack/react-router';
import { BookOpen, LogOut, Settings } from 'lucide-react';

import { Identicon } from '@/components/account/identicon';
import { DropdownMenu } from '@/components/ui/dropdown-menu';
import { authClient } from '@/lib/auth-client';

/**
 * Sign-out always lands on /sign-in, even if the request fails — forcing a fresh sign-in beats
 * leaving a dead session on an authed-looking page.
 */
export function AvatarMenu({ email, seed }: { email: string; seed: string }) {
  const router = useRouter();

  async function handleSignOut() {
    try {
      await authClient.signOut();
    } finally {
      await router.navigate({ to: '/sign-in' });
    }
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        aria-label="Account"
        className="focus-visible:ring-focus hover:bg-surface-active inline-flex size-8 items-center rounded-full border p-2 outline-none focus-visible:ring-3"
      >
        <Identicon seed={seed} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Positioner align="end">
          <DropdownMenu.Popup className="w-56">
            <DropdownMenu.Group>
              <DropdownMenu.GroupLabel className="truncate">{email}</DropdownMenu.GroupLabel>
            </DropdownMenu.Group>
            <DropdownMenu.Separator />
            <DropdownMenu.Item
              render={
                <Link to="/docs">
                  <BookOpen data-icon="inline-start" />
                  Docs
                </Link>
              }
            />
            <DropdownMenu.Item
              render={
                <Link to="/settings">
                  <Settings data-icon="inline-start" />
                  Settings
                </Link>
              }
            />
            <DropdownMenu.Item
              onClick={() => {
                void handleSignOut();
              }}
            >
              <LogOut data-icon="inline-start" />
              Sign out
            </DropdownMenu.Item>
          </DropdownMenu.Popup>
        </DropdownMenu.Positioner>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
