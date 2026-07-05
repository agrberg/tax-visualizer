import { useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { normalizeName, sortedNames, type SavedInputs } from '@/savedInputs'

interface SavedInputsProps {
  saved: SavedInputs
  selectedName: string | null
  onSave: (name: string) => void
  onLoad: (name: string) => void
  onDelete: (name: string) => void
  onRename: (oldName: string) => void
  onUpdate: (name: string) => void
}

export function SavedInputs({
  saved,
  selectedName,
  onSave,
  onLoad,
  onDelete,
  onRename,
  onUpdate,
}: SavedInputsProps) {
  const [name, setName] = useState('')
  const names = sortedNames(saved)
  const canSave = normalizeName(name) !== null

  const handleSave = () => {
    if (!canSave) return
    onSave(name)
    setName('')
  }

  return (
    <div className="space-y-3">
      <Label htmlFor="saveName" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Saved versions
      </Label>

      <div className="flex gap-2">
        <Input
          id="saveName"
          type="text"
          placeholder="Name this version"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave()
          }}
        />
        <Button type="button" size="sm" disabled={!canSave} onClick={handleSave}>
          Save
        </Button>
      </div>

      {names.length === 0 ? (
        <p className="text-sm text-muted-foreground">No saved versions yet</p>
      ) : (
        <ul className="space-y-1">
          {names.map((n) => (
            <li key={n} className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onLoad(n)}
                className={`flex-1 truncate rounded-md px-2 py-1 text-left text-sm hover:bg-accent hover:text-accent-foreground ${
                  n === selectedName ? 'bg-accent font-medium text-accent-foreground' : ''
                }`}
                aria-current={n === selectedName}
              >
                {n}
              </button>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => onUpdate(n)}
              >
                Update
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={`Rename ${n}`}
                onClick={() => onRename(n)}
              >
                <Pencil />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={`Delete ${n}`}
                onClick={() => onDelete(n)}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
