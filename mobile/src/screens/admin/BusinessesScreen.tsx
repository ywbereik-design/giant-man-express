import React, { useCallback, useMemo, useState } from "react";
import { FlatList, Text, View, StyleSheet } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, ApiError } from "../../api/client";
import { Business } from "../../api/types";
import { Button, Card, CenteredSpinner, ErrorText, FieldInput, Label, SectionTitle } from "../../components/ui";
import { isValidEmail, isValidPhone } from "../../lib/validation";
import { spacing, ThemeColors } from "../../theme/theme";
import { useTheme } from "../../theme/ThemeContext";

function parseRate(raw: string): { rate?: number; error?: string } {
  if (!raw.trim()) return {};
  const rate = Number(raw.trim());
  if (Number.isNaN(rate) || rate <= 0) return { error: "Billing rate must be a positive number" };
  return { rate };
}

export function BusinessesScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [name, setName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [billingRate, setBillingRate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editContactName, setEditContactName] = useState("");
  const [editContactEmail, setEditContactEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editBillingRate, setEditBillingRate] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ businesses: Business[] }>("/api/businesses");
      setBusinesses(res.businesses);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load businesses");
    } finally {
      setInitialLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function addBusiness() {
    setError(null);
    if (!name.trim()) {
      setError("Enter a business name");
      return;
    }
    if (contactEmail.trim() && !isValidEmail(contactEmail.trim())) {
      setError("Enter a valid contact email address");
      return;
    }
    if (phone.trim() && !isValidPhone(phone.trim())) {
      setError("Enter a valid phone number, or leave it blank");
      return;
    }
    const { rate, error: rateError } = parseRate(billingRate);
    if (rateError) {
      setError(rateError);
      return;
    }
    setSaving(true);
    try {
      await api.post("/api/businesses", {
        name: name.trim(),
        contactName: contactName.trim() || undefined,
        contactEmail: contactEmail.trim() || undefined,
        phone: phone.trim() || undefined,
        address: address.trim() || undefined,
        billingRate: rate,
      });
      setName("");
      setContactName("");
      setContactEmail("");
      setPhone("");
      setAddress("");
      setBillingRate("");
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not add business");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(business: Business) {
    setEditingId(business.id);
    setEditName(business.name);
    setEditContactName(business.contactName ?? "");
    setEditContactEmail(business.contactEmail ?? "");
    setEditPhone(business.phone ?? "");
    setEditAddress(business.address ?? "");
    setEditBillingRate(business.billingRate ? String(business.billingRate) : "");
    setEditError(null);
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveEdit(business: Business) {
    setEditError(null);
    if (!editName.trim()) {
      setEditError("Business name is required");
      return;
    }
    if (editContactEmail.trim() && !isValidEmail(editContactEmail.trim())) {
      setEditError("Enter a valid contact email address");
      return;
    }
    if (editPhone.trim() && !isValidPhone(editPhone.trim())) {
      setEditError("Enter a valid phone number, or leave it blank");
      return;
    }
    const { rate, error: rateError } = parseRate(editBillingRate);
    if (rateError) {
      setEditError(rateError);
      return;
    }
    setEditSaving(true);
    try {
      await api.patch(`/api/businesses/${business.id}`, {
        name: editName.trim(),
        contactName: editContactName.trim() || undefined,
        contactEmail: editContactEmail.trim() || undefined,
        phone: editPhone.trim() || undefined,
        address: editAddress.trim() || undefined,
        billingRate: rate,
      });
      setEditingId(null);
      await load();
    } catch (e) {
      setEditError(e instanceof ApiError ? e.message : "Could not save changes");
    } finally {
      setEditSaving(false);
    }
  }

  if (initialLoading) return <CenteredSpinner />;

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing.md }}
      data={businesses}
      keyExtractor={(b) => b.id}
      ListHeaderComponent={
        <View>
          <SectionTitle>Add Business</SectionTitle>
          <Card>
            <Label>Business Name</Label>
            <FieldInput value={name} onChangeText={setName} placeholder="Capital BBQ" />
            <Label>Contact Name (optional)</Label>
            <FieldInput value={contactName} onChangeText={setContactName} placeholder="Jane Doe" />
            <Label>Contact Email (optional)</Label>
            <FieldInput value={contactEmail} onChangeText={setContactEmail} autoCapitalize="none" keyboardType="email-address" placeholder="ap@business.ca" />
            <Label>Phone (optional)</Label>
            <FieldInput value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="613-555-0100" />
            <Label>Address (optional)</Label>
            <FieldInput value={address} onChangeText={setAddress} placeholder="100 Main St, Ottawa" />
            <Label>Billing Rate per Job ($, optional)</Label>
            <FieldInput value={billingRate} onChangeText={setBillingRate} keyboardType="decimal-pad" placeholder="45" />
            <ErrorText>{error}</ErrorText>
            <Button title="Add Business" onPress={addBusiness} loading={saving} />
          </Card>
          <SectionTitle>Businesses</SectionTitle>
        </View>
      }
      ListEmptyComponent={!error ? <Text style={styles.empty}>No businesses yet.</Text> : null}
      renderItem={({ item }) => {
        if (editingId === item.id) {
          return (
            <Card>
              <Label>Business Name</Label>
              <FieldInput value={editName} onChangeText={setEditName} />
              <Label>Contact Name (optional)</Label>
              <FieldInput value={editContactName} onChangeText={setEditContactName} />
              <Label>Contact Email (optional)</Label>
              <FieldInput value={editContactEmail} onChangeText={setEditContactEmail} autoCapitalize="none" keyboardType="email-address" />
              <Label>Phone (optional)</Label>
              <FieldInput value={editPhone} onChangeText={setEditPhone} keyboardType="phone-pad" />
              <Label>Address (optional)</Label>
              <FieldInput value={editAddress} onChangeText={setEditAddress} />
              <Label>Billing Rate per Job ($, optional)</Label>
              <FieldInput value={editBillingRate} onChangeText={setEditBillingRate} keyboardType="decimal-pad" />
              <ErrorText>{editError}</ErrorText>
              <Button title="Save Changes" onPress={() => saveEdit(item)} loading={editSaving} />
              <Button title="Cancel" variant="secondary" onPress={cancelEdit} />
            </Card>
          );
        }
        return (
          <Card>
            <Text style={styles.name}>{item.name}</Text>
            {item.contactEmail && <Text style={styles.meta}>{item.contactEmail}</Text>}
            {item.phone && <Text style={styles.meta}>{item.phone}</Text>}
            {item.address && <Text style={styles.meta}>{item.address}</Text>}
            <Text style={styles.meta}>
              Rate: {item.billingRate ? `$${item.billingRate.toFixed(2)} / job` : "not set"}
            </Text>
            <View style={{ marginTop: spacing.sm }}>
              <Button title="Edit" variant="secondary" onPress={() => startEdit(item)} />
            </View>
          </Card>
        );
      }}
    />
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
  name: { color: colors.text, fontSize: 16, fontWeight: "700" },
  meta: { color: colors.textMuted, marginTop: 2, fontSize: 13 },
  empty: { color: colors.textMuted, textAlign: "center", marginTop: spacing.lg },
  });
}
