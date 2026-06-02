// components/TagSearch.js
// Shared tag search component used by BetScreen and SubmitVideoScreen
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TextInput, Pressable,
  ScrollView, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { getApi } from '../Supabaseconfig';
import { COLORS, FONTS, RADIUS, SPACING } from '../theme';

export default function TagSearch({ selectedTags, onChange, maxTags = 5, placeholder }) {
  const [query,       setQuery]       = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [loadingSug,  setLoadingSug]  = useState(false);
  const debounceRef = useRef(null);

  const search = useCallback(async (q) => {
    setLoadingSug(true);
    try {
      const r = await getApi('/tags/search', { q, limit: '8' });
      setSuggestions(r.tags || []);
    } catch (_) {
      setSuggestions([
        'trending_sound', 'strong_hook', 'humor', 'emotional', 'dance_challenge',
        'controversy', 'news_moment', 'relatable', 'satisfying', 'early_trend',
      ].filter(t => t.includes(q.toLowerCase())));
    } finally {
      setLoadingSug(false);
    }
  }, []);

  const onQueryChange = (v) => {
    setQuery(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(v), 300);
  };

  const addTag = async (tag) => {
    const clean = tag.trim().toLowerCase().replace(/\s+/g, '_');
    if (!clean || selectedTags.includes(clean) || selectedTags.length >= maxTags) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onChange([...selectedTags, clean]);
    setQuery('');
    setSuggestions([]);
  };

  const removeTag = async (tag) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onChange(selectedTags.filter(t => t !== tag));
  };

  const handleAddCustom = () => {
    if (query.trim()) addTag(query.trim());
  };

  useEffect(() => { search(''); }, []);

  return (
    <View style={styles.container}>
      {selectedTags.length > 0 && (
        <View style={styles.selectedRow}>
          {selectedTags.map(tag => (
            <Pressable key={tag} style={styles.selectedTag} onPress={() => removeTag(tag)}>
              <Text style={styles.selectedTagText}>{tag.replace(/_/g, ' ')}</Text>
              <Ionicons name="close" size={12} color={COLORS.yes} />
            </Pressable>
          ))}
        </View>
      )}

      <View style={styles.inputRow}>
        <Ionicons name="search-outline" size={15} color={COLORS.muted} />
        <TextInput
          style={styles.input}
          placeholder={selectedTags.length >= maxTags
            ? `Max ${maxTags} tags`
            : placeholder || 'Search or create a tag…'}
          placeholderTextColor={COLORS.muted}
          value={query}
          onChangeText={onQueryChange}
          editable={selectedTags.length < maxTags}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={handleAddCustom}
        />
        {loadingSug && <ActivityIndicator size="small" color={COLORS.muted} />}
        {query.trim() && !loadingSug && (
          <Pressable onPress={handleAddCustom} style={styles.addBtn}>
            <Text style={styles.addBtnText}>Add</Text>
          </Pressable>
        )}
      </View>

      {suggestions.length > 0 && (
        <View style={styles.suggestionsBox}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.suggestionsRow}>
            {suggestions.map(tag => {
              const isSelected = selectedTags.includes(tag);
              return (
                <Pressable
                  key={tag}
                  style={[styles.suggestionPill, isSelected && styles.suggestionPillSelected]}
                  onPress={() => isSelected ? removeTag(tag) : addTag(tag)}
                >
                  {isSelected && <Ionicons name="checkmark" size={11} color={COLORS.yes} />}
                  <Text style={[styles.suggestionText, isSelected && { color: COLORS.yes }]}>
                    {tag.replace(/_/g, ' ')}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      <Text style={styles.hint}>
        {selectedTags.length}/{maxTags} tags · Tap to add, tap again to remove
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container:    { gap: SPACING.sm },
  selectedRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  selectedTag:  { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.yesGlow, borderRadius: RADIUS.full, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: COLORS.yes + '44' },
  selectedTagText: { color: COLORS.yes, fontFamily: FONTS.body, fontSize: 11, fontWeight: '700' },
  inputRow:     { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.surfaceHigh, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: SPACING.sm, paddingVertical: 4 },
  input:        { flex: 1, color: COLORS.text, fontFamily: FONTS.body, fontSize: 13, paddingVertical: 10 },
  addBtn:       { backgroundColor: COLORS.accent, borderRadius: RADIUS.sm, paddingHorizontal: 10, paddingVertical: 5 },
  addBtnText:   { color: '#fff', fontFamily: FONTS.body, fontSize: 11, fontWeight: '700' },
  suggestionsBox: { backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, padding: 8 },
  suggestionsRow: { gap: 6, paddingVertical: 2 },
  suggestionPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.surfaceHigh, borderRadius: RADIUS.full, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: COLORS.border },
  suggestionPillSelected: { borderColor: COLORS.yes, backgroundColor: COLORS.yesGlow },
  suggestionText: { color: COLORS.textSub, fontFamily: FONTS.body, fontSize: 11 },
  hint:         { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 10, textAlign: 'center' },
});
