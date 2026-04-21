import { useState, useEffect, useRef } from 'react'
import { useMapsLibrary } from '@vis.gl/react-google-maps'

const LONDON_CENTER = { lat: 51.5074, lng: -0.1278 }

/**
 * Minimal reusable Places autocomplete input.
 * onSelect({ name, address, location: {lat, lng} })
 */
export default function PlaceSearch({
  placeholder = 'Search…',
  defaultValue = '',
  onSelect,
  onClear,
  className = '',
  inputClassName = '',
}) {
  const [value,       setValue]       = useState(defaultValue)
  const [suggestions, setSuggestions] = useState([])
  const [open,        setOpen]        = useState(false)

  const placesLib   = useMapsLibrary('places')
  const sessionToken = useRef(null)
  const containerRef = useRef(null)
  // Skip the fetch that would otherwise fire right after a selection
  // repopulates the input with the chosen place's display name.
  const skipNextFetch = useRef(false)

  useEffect(() => {
    if (!placesLib) return
    sessionToken.current = new placesLib.AutocompleteSessionToken()
  }, [placesLib])

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (!placesLib || !value.trim()) {
      setSuggestions([])
      setOpen(false)
      return
    }
    if (skipNextFetch.current) {
      skipNextFetch.current = false
      return
    }

    let cancelled = false

    placesLib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
      input: value,
      sessionToken: sessionToken.current,
      includedRegionCodes: ['gb'],
      locationBias: { center: LONDON_CENTER, radius: 30000 },
    }).then(({ suggestions: results }) => {
      if (cancelled) return
      setSuggestions(results ?? [])
      setOpen((results ?? []).length > 0)
    }).catch(() => {
      if (!cancelled) { setSuggestions([]); setOpen(false) }
    })

    return () => { cancelled = true }
  }, [value, placesLib])

  const handleSelect = async (suggestion) => {
    try {
      const place = suggestion.placePrediction.toPlace()
      await place.fetchFields({ fields: ['location', 'displayName', 'formattedAddress'] })
      sessionToken.current = new placesLib.AutocompleteSessionToken()

      const name = place.displayName ?? suggestion.placePrediction.text.toString()
      skipNextFetch.current = true
      setValue(name)
      setSuggestions([])
      setOpen(false)

      onSelect?.({
        name,
        address:  place.formattedAddress,
        location: { lat: place.location.lat(), lng: place.location.lng() },
      })
    } catch (err) {
      // Places API connection failures (common when Google is blocked by local network)
      console.warn('PlaceSearch: could not fetch place details:', err.message)
    }
  }

  const handleClear = () => {
    setValue('')
    setSuggestions([])
    setOpen(false)
    onClear?.()
  }

  return (
    <div className={`place-search ${className}`} ref={containerRef}>
      <div className="place-search__input-row">
        <input
          className={`place-search__input ${inputClassName}`}
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
        {value && (
          <button type="button" className="place-search__clear" onClick={handleClear}>✕</button>
        )}
      </div>

      {open && suggestions.length > 0 && (
        <ul className="place-search__suggestions">
          {suggestions.map((s, i) => {
            const pred = s.placePrediction
            return (
              <li
                key={pred.placeId ?? i}
                className="place-search__suggestion"
                onMouseDown={(e) => { e.preventDefault(); handleSelect(s) }}
              >
                <span className="place-search__suggestion-main">
                  {pred.mainText?.toString() ?? pred.text.toString()}
                </span>
                <span className="place-search__suggestion-sec">
                  {pred.secondaryText?.toString() ?? ''}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
