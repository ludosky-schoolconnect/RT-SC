/**
 * RT-SC · SearchInput
 *
 * Debounced search field. Calls onSearch with the trimmed value after 300ms idle.
 * Clear button appears when there's content.
 */

import { useEffect, useRef, useState, type InputHTMLAttributes } from 'react'
import { Search, X } from 'lucide-react'
import { cn } from '@/lib/cn'

interface SearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  onSearch: (value: string) => void
  debounceMs?: number
  containerClassName?: string
}

export function SearchInput({
  onSearch,
  debounceMs = 300,
  placeholder = 'Rechercher…',
  className,
  containerClassName,
  defaultValue = '',
  ...rest
}: SearchInputProps) {
  const [value, setValue] = useState(String(defaultValue))
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      onSearch(value.trim())
    }, debounceMs)
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  return (
    <div className={cn('relative', containerClassName)}>
      <Search
        className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400 pointer-events-none"
        aria-hidden
      />
      <input
        type="search"
        value={value}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        className={cn(
          'w-full min-h-touch rounded-md border-[1.5px] border-ink-100 bg-white pl-10 pr-10 py-3 text-[0.9375rem]',
          'placeholder:text-ink-400 text-ink-800',
          'transition-colors duration-150 ease-out-soft',
          'focus:outline-none focus:border-navy focus:ring-2 focus:ring-gold/30',
          className
        )}
        {...rest}
      />
      {value && (
        <button
          type="button"
          onClick={() => setValue('')}
          aria-label="Effacer la recherche"
          className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 inline-flex items-center justify-center rounded-md text-ink-400 hover:text-navy hover:bg-ink-50 transition-colors"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      )}
    </div>
  )
}
