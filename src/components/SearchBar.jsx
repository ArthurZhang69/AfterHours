import { useState, useEffect, useRef } from 'react'
import { useMapsLibrary } from '@vis.gl/react-google-maps'

const LONDON_CENTER = { lat: 51.5074, lng: -0.1278 }

export default function SearchBar({
  onSearch,       // destination selected → { name, address, location }
  onRouteMode,
}) {
  const [value,       setValue]       = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [open,        setOpen]        = useState(false)

  const placesLib    = useMapsLibrary('places')
  const sessionToken = useRef(null)
  // Set right before we programmatically fill the input with the
  // chosen place's name. Without this guard the value-change
  // triggers a fresh autocomplete fetch that re-opens the dropdown
  // the moment we just closed it.
  const skipNextFetch = useRef(false)

  useEffect(() => {
    if (!placesLib) return
    sessionToken.current = new placesLib.AutocompleteSessionToken()
  }, [placesLib])

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
      const payload = {
        name,
        address:  place.formattedAddress,
        location: { lat: place.location.lat(), lng: place.location.lng() },
      }

      skipNextFetch.current = true
      setValue(name)
      setSuggestions([])
      setOpen(false)
      onSearch?.(payload)
    } catch (err) {
      console.error('Search error:', err)
    }
  }

  const handleClear = () => {
    setValue('')
    setSuggestions([])
    setOpen(false)
  }

  // Fire a global event the Onboarding component listens for.
  // Using a CustomEvent avoids prop-drilling a ref/callback chain
  // just so one button in the header can re-open the tour.
  const handleHelp = () => {
    window.dispatchEvent(new CustomEvent('afterhours:tour'))
  }

  return (
    <div className="search-bar">
      <div className="search-bar__wrapper">
        <form
          className="search-bar__form"
          onSubmit={(e) => { e.preventDefault(); if (suggestions[0]) handleSelect(suggestions[0]) }}
        >
          <span className="search-bar__icon">◎</span>
          <input
            className="search-bar__input"
            type="text"
            placeholder="Search destination…"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          {value && (
            <button type="button" className="search-bar__clear" onClick={handleClear}>✕</button>
          )}
        </form>

        {open && suggestions.length > 0 && (
          <ul className="search-bar__suggestions">
            {suggestions.map((s, i) => {
              const pred = s.placePrediction
              return (
                <li
                  key={pred.placeId ?? i}
                  className="search-bar__suggestion"
                  onMouseDown={(e) => { e.preventDefault(); handleSelect(s) }}
                >
                  <span className="search-bar__suggestion-main">
                    {pred.mainText?.toString() ?? pred.text.toString()}
                  </span>
                  <span className="search-bar__suggestion-sec">
                    {pred.secondaryText?.toString() ?? ''}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Help / replay-tour button (sits where the old browse-area 🗺
          button used to — browse mode was retired as redundant with
          plain destination search). */}
      <button
        className="search-bar__help-btn"
        onClick={handleHelp}
        title="Replay tour"
        aria-label="Replay tour"
      >
        ?
      </button>

      <button className="search-bar__route-btn" onClick={onRouteMode} title="Compare routes">
        ↗
      </button>
    </div>
  )
}
