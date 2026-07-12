import { useEffect, useState } from 'react'
import { SavedScenarios } from '@/components/SavedScenarios'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { loadScenarios, saveScenarios } from '@/storage'
import {
  normalizeName,
  saveScenario,
  removeScenario,
  renameScenario,
  type Scenarios,
} from '@/scenarios'
import type { TaxInput } from '@/tax/types'

/** A pending scenario action awaiting in-app confirmation (replaces window.confirm/prompt). */
type ScenarioDialog =
  | { kind: 'overwrite'; name: string }
  | { kind: 'update'; name: string }
  | { kind: 'delete'; name: string }
  | { kind: 'rename'; oldName: string }

// Keyed by kind so a new ScenarioDialog variant fails to compile until it's given a
// title and confirm label (the render is otherwise not exhaustiveness-checked).
const DIALOG_TITLE: Record<ScenarioDialog['kind'], string> = {
  overwrite: 'Overwrite scenario?',
  update: 'Update scenario?',
  delete: 'Delete scenario?',
  rename: 'Rename scenario',
}
const CONFIRM_LABEL: Record<ScenarioDialog['kind'], string> = {
  overwrite: 'Overwrite',
  update: 'Update',
  delete: 'Delete',
  rename: 'Rename',
}

interface ScenarioManagerProps {
  /** The current inputs — saved as-is when the user names or updates a scenario. */
  input: TaxInput
  /** The scenario whose values are currently loaded, highlighted in the list. Lives in
      the parent because importing a return also clears it. */
  selectedName: string | null
  onSelectedNameChange: (name: string | null) => void
  /** Push a loaded scenario's inputs up to the app. */
  onLoad: (input: TaxInput) => void
}

/**
 * Owns saved-scenario persistence and the full save / load / update / rename / delete
 * flow, including the confirmation dialogs (a native `<dialog>` Modal in place of
 * window.confirm/prompt). The selected-scenario name is parent state, since loading a
 * scenario and importing a return both affect it.
 */
export function ScenarioManager({
  input,
  selectedName,
  onSelectedNameChange,
  onLoad,
}: ScenarioManagerProps) {
  const [scenarios, setScenarios] = useState<Scenarios>(() => loadScenarios())
  const [dialog, setDialog] = useState<ScenarioDialog | null>(null)
  const [renameValue, setRenameValue] = useState('')

  useEffect(() => {
    saveScenarios(scenarios)
  }, [scenarios])

  const handleSave = (rawName: string) => {
    const name = normalizeName(rawName)
    if (!name) return
    if (scenarios[name]) {
      setDialog({ kind: 'overwrite', name })
      return
    }
    setScenarios((s) => saveScenario(s, name, input))
    onSelectedNameChange(name)
  }

  const handleLoad = (name: string) => {
    const scenario = scenarios[name]
    if (!scenario) return
    onLoad({ ...scenario })
    onSelectedNameChange(name)
  }

  const handleUpdate = (name: string) => {
    if (!scenarios[name]) return
    setDialog({ kind: 'update', name })
  }

  const handleRename = (oldName: string) => {
    setRenameValue(oldName)
    setDialog({ kind: 'rename', oldName })
  }

  const handleDelete = (name: string) => {
    if (!scenarios[name]) return
    setDialog({ kind: 'delete', name })
  }

  // The typed rename, normalized; whether it's a submittable change; and whether it
  // would clobber another scenario. `renameValid` gates both the button's disabled
  // state and the Enter key so they can't diverge. `?? ''` sidesteps indexing with a
  // possible null (renameValid already guarantees non-null at runtime).
  const renameNormalized = normalizeName(renameValue)
  const renameValid =
    dialog?.kind === 'rename' && renameNormalized !== null && renameNormalized !== dialog.oldName
  const renameCollision = renameValid && scenarios[renameNormalized ?? ''] !== undefined

  const closeDialog = () => setDialog(null)

  const confirmDialog = () => {
    if (!dialog) return
    switch (dialog.kind) {
      case 'overwrite':
      case 'update':
        setScenarios((s) => saveScenario(s, dialog.name, input))
        onSelectedNameChange(dialog.name)
        break
      case 'delete':
        setScenarios((s) => removeScenario(s, dialog.name))
        onSelectedNameChange(selectedName === dialog.name ? null : selectedName)
        break
      case 'rename': {
        if (renameNormalized === null || renameNormalized === dialog.oldName) break
        setScenarios((s) => renameScenario(s, dialog.oldName, renameNormalized))
        onSelectedNameChange(selectedName === dialog.oldName ? renameNormalized : selectedName)
        break
      }
      default:
        // Compile-time exhaustiveness: a new ScenarioDialog variant makes this error.
        dialog satisfies never
    }
    closeDialog()
  }

  return (
    <>
      <SavedScenarios
        scenarios={scenarios}
        selectedName={selectedName}
        onSave={handleSave}
        onLoad={handleLoad}
        onDelete={handleDelete}
        onRename={handleRename}
        onUpdate={handleUpdate}
      />

      <Modal
        open={dialog !== null}
        onClose={closeDialog}
        labelledBy="scenario-dialog-title"
        className="max-w-sm"
      >
        {dialog && (
          <div className="space-y-4">
            <h2 id="scenario-dialog-title" className="text-base font-medium">
              {DIALOG_TITLE[dialog.kind]}
            </h2>

            {dialog.kind === 'overwrite' && (
              <p className="text-sm text-muted-foreground">
                A scenario named “{dialog.name}” already exists. Replace it with the current inputs?
              </p>
            )}
            {dialog.kind === 'update' && (
              <p className="text-sm text-muted-foreground">
                Replace “{dialog.name}” with the current inputs?
              </p>
            )}
            {dialog.kind === 'delete' && (
              <p className="text-sm text-muted-foreground">
                Delete “{dialog.name}”? This can’t be undone.
              </p>
            )}
            {dialog.kind === 'rename' && (
              <div className="space-y-1.5">
                <Label htmlFor="scenario-rename" className="text-sm">
                  New name
                </Label>
                <Input
                  id="scenario-rename"
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && renameValid) confirmDialog()
                  }}
                />
                {renameCollision && (
                  <p className="text-xs text-amber-700">
                    A scenario named “{renameNormalized}” already exists — renaming will overwrite
                    it.
                  </p>
                )}
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={closeDialog}>
                Cancel
              </Button>
              <Button
                variant={dialog.kind === 'delete' ? 'destructive' : 'default'}
                size="sm"
                className="flex-1"
                disabled={dialog.kind === 'rename' && !renameValid}
                onClick={confirmDialog}
              >
                {CONFIRM_LABEL[dialog.kind]}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}
