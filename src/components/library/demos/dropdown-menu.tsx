import { useState } from 'react';

import { CopyIcon, PencilIcon, Trash2Icon } from 'lucide-react';

import type { LibraryDemo } from '@/components/library/demo';
import { Playground } from '@/components/library/playground';
import { Button } from '@/components/ui/button';
import { DropdownMenu } from '@/components/ui/dropdown-menu';

const aligns = ['start', 'center', 'end'] as const;

function DropdownMenuDemo() {
  const [showStatusBar, setShowStatusBar] = useState(true);
  const [showActivityLog, setShowActivityLog] = useState(false);
  const [sortBy, setSortBy] = useState('name');

  return (
    <Playground
      controls={{
        align: { kind: 'select', label: 'Align', options: aligns, defaultValue: 'start' },
        checkboxItems: { kind: 'boolean', label: 'Checkbox items', defaultValue: true },
        radioGroup: { kind: 'boolean', label: 'Radio group', defaultValue: true },
        submenu: { kind: 'boolean', label: 'Submenu', defaultValue: true },
      }}
      render={(values) => (
        <DropdownMenu.Root>
          <DropdownMenu.Trigger render={<Button variant="outline" />}>Options</DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Positioner align={values.align}>
              <DropdownMenu.Popup>
                <DropdownMenu.Item>
                  <PencilIcon data-icon="inline-start" />
                  Rename
                </DropdownMenu.Item>
                <DropdownMenu.Item>
                  <CopyIcon data-icon="inline-start" />
                  Duplicate
                </DropdownMenu.Item>
                {values.submenu && (
                  <DropdownMenu.SubmenuRoot>
                    <DropdownMenu.SubmenuTrigger>Export as</DropdownMenu.SubmenuTrigger>
                    <DropdownMenu.Portal>
                      <DropdownMenu.Positioner align="start" side="right">
                        <DropdownMenu.Popup>
                          <DropdownMenu.Item>JSON</DropdownMenu.Item>
                          <DropdownMenu.Item>HTML</DropdownMenu.Item>
                        </DropdownMenu.Popup>
                      </DropdownMenu.Positioner>
                    </DropdownMenu.Portal>
                  </DropdownMenu.SubmenuRoot>
                )}
                {values.checkboxItems && (
                  <>
                    <DropdownMenu.Separator />
                    <DropdownMenu.Group>
                      <DropdownMenu.GroupLabel>Panels</DropdownMenu.GroupLabel>
                      <DropdownMenu.CheckboxItem
                        checked={showStatusBar}
                        onCheckedChange={setShowStatusBar}
                      >
                        Status bar
                      </DropdownMenu.CheckboxItem>
                      <DropdownMenu.CheckboxItem
                        checked={showActivityLog}
                        onCheckedChange={setShowActivityLog}
                      >
                        Activity log
                      </DropdownMenu.CheckboxItem>
                    </DropdownMenu.Group>
                  </>
                )}
                {values.radioGroup && (
                  <>
                    <DropdownMenu.Separator />
                    <DropdownMenu.RadioGroup onValueChange={setSortBy} value={sortBy}>
                      <DropdownMenu.GroupLabel>Sort by</DropdownMenu.GroupLabel>
                      <DropdownMenu.RadioItem value="name">Name</DropdownMenu.RadioItem>
                      <DropdownMenu.RadioItem value="date">Date modified</DropdownMenu.RadioItem>
                    </DropdownMenu.RadioGroup>
                  </>
                )}
                <DropdownMenu.Separator />
                <DropdownMenu.Item variant="destructive">
                  <Trash2Icon data-icon="inline-start" />
                  Delete
                </DropdownMenu.Item>
              </DropdownMenu.Popup>
            </DropdownMenu.Positioner>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      )}
    />
  );
}

export const dropdownMenuDemo: LibraryDemo = {
  slug: 'dropdown-menu',
  title: 'Dropdown Menu',
  description: 'A triggered popup menu for grouped actions, checkboxes, radios, and submenus.',
  group: 'Components',
  render: () => <DropdownMenuDemo />,
};
