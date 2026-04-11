import { useState, useEffect, useRef } from 'react'
import { useMapsLibrary } from '@vis.gl/react-google-maps'

const LONDON_CENTER = { lat: 51.5074, lng: -0.1278 }

export default function SearchBar({
  onSearch,       // destination selected → { name, address, location }
  onBrowse,       // area browse selected → { name, location }
  onBrowseReset,  // user clears browse mode
  browseArea,     // currently browsing area name (string | null)
  onRouteMode,
}) {
  const [value,       setValue]       = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [open,        setOpen]        = useState(false)
  const [mode,        setMode]        = useState('dest') // 'dest' | 'browse'

  const placesLib    = useMapsLibrary('places')
  const sessionToken = useRef(null)

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

      setValue(name)
      setSuggestions([])
      setOpen(false)

      if (mode === 'browse') {
        onBrowse?.(payload)
        setValue('')  // clear after selecting browse area
      } else {
        onSearch?.(payload)
      }
    } catch (err) {
      console.error('Search error:', err)
    }
  }

  const handleClear = () => {
    setValue('')
    setSuggestions([])
    setOpen(false)
  }

  const toggleMode = () => {
    const next = mode === 'dest' ? 'browse' : 'dest'
    setMode(next)
    setValue('')
    setSuggestions([])
    setOpen(false)
    if (next === 'dest' && browseArea) onBrowseReset?.()
  }

  const isBrowse = mode === 'browse'

  return (
    <div className="search-bar">
      <div className="search-bar__wrapper">
        <form
          className={`search-bar__form ${isBrowse ? 'search-bar__form--browse' : ''}`}
          onSubmit={(e) => { e.preventDefault(); if (suggestions[0]) handleSelect(suggestions[0]) }}
        >
          <span className="search-bar__icon">{isBrowse ? '📍' : '◎'}</span>
          <input
            className="search-bar__input"
            type="text"
            placeholder={isBrowse ? 'Browse area…' : 'Search destination…'}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          {value && (
            <button type="button" className="search-bar__clear" onClick={handleClear}>✕</button>
          )}
        </form>

        {/* Browse area indicator */}
        {isBrowse && browseArea && (
          <div className="search-bar__browse-chip">
            <span className="search-bar__browse-name">{browseArea}</span>
            <button
              className="search-bar__browse-reset"
              onClick={() => { onBrowseReset?.(); setMode('dest') }}
            >
              ✕
            </button>
          </div>
        )}

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

      {/* Browse toggle button */}
      <button
        className={`search-bar__browse-btn ${isBrowse ? 'search-bar__browse-btn--active' : ''}`}
        onClick={toggleMode}
        title={isBrowse ? 'Switch to destination search' : 'Browse an area'}
      >
        🗺
      </button>

      <button className="search-bar__route-btn" onClick={onRouteMode} title="Compare routes">
        ↗
      </button>
    </div>
  )
}
