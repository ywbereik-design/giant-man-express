import React, { memo, useCallback, useMemo, useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform, Text, View, StyleSheet } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, ApiError } from "../../api/client";
import { Business, BILLING_TYPES, BillingType } from "../../api/types";
import { Badge, Button, Card, CenteredSpinner, ErrorText, FieldInput, Label, SectionTitle } from "../../components/ui";
import { ChipSelect } from "../../components/ChipSelect";
import { isValidEmail, isValidPhone } from "../../lib/validation";
import { spacing, ThemeColors } from "../../theme/theme";
import { useTheme } from "../../theme/ThemeContext";

const BILLING_TYPE_OPTIONS = BILLING_TYPES.map((t) => ({ id: t.id, label: t.label }));
const BILLING_TYPE_LABEL: Record<BillingType, string> = {
  PER_TRIP: "job",
  PER_HOUR: "hour",
  FLAT_RATE: "flat",
};

function parseRate(raw: string): { rate?: number; error?: string } {
  if (!raw.trim()) return {};
  const rate = Number(raw.trim());
  if (Number.isNaN(rate) || rate <= 0) return { error: "Billing rate must be a positive number" };
  return { rate };
}

// Memoized so typing in the "Add Business" form above the list doesn't
// re-render every existing business card on every keystroke — mirrors the
// DriverRow pattern in DriversScreen.tsx. Edit-mode fields are normalized to
// constant values for rows that aren't being edited (see renderItem below)
// so memo's shallow prop compare still bails out for them even while a
// different row's edit form is being typed into.
const BusinessRow = memo(function BusinessRow({
  item,
  isEditing,
  editName,
  editCode,
  editContactName,
  editContactEmail,
  editPhone,
  editAddress,
  editBillingRate,
  editBillingType,
  editError,
  editSaving,
  onEditNameChange,
  onEditCodeChange,
  onEditContactNameChange,
  onEditContactEmailChange,
  onEditPhoneChange,
  onEditAddressChange,
  onEditBillingRateChange,
  onEditBillingTypeChange,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
}: {
  item: Business;
  isEditing: boolean;
  editName: string;
  editCode: string;
  editContactName: string;
  editContactEmail: string;
  editPhone: string;
  editAddress: string;
  editBillingRate: string;
  editBillingType: BillingType;
  editError: string | null;
  editSaving: boolean;
  onEditNameChange: (v: string) => void;
  onEditCodeChange: (v: string) => void;
  onEditContactNameChange: (v: string) => void;
  onEditContactEmailChange: (v: string) => void;
  onEditPhoneChange: (v: string) => void;
  onEditAddressChange: (v: string) => void;
  onEditBillingRateChange: (v: string) => void;
  onEditBillingTypeChange: (v: string) => void;
  onStartEdit: (business: Business) => void;
  onCancelEdit: () => void;
  onSaveEdit: (business: Business) => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  if (isEditing) {
    return (
      <Card>
        <Label>Business Name</Label>
        <FieldInput value={editName} onChangeText={onEditNameChange} accessibilityLabel="Business Name" />
        <Label>Code (optional)</Label>
        <FieldInput
          value={editCode}
          onChangeText={onEditCodeChange}
          autoCapitalize="characters"
          maxLength={30}
          accessibilityLabel="Code"
        />
        <Label>Contact Name (optional)</Label>
        <FieldInput value={editContactName} onChangeText={onEditContactNameChange} accessibilityLabel="Contact Name" />
        <Label>Contact Email (optional)</Label>
        <FieldInput
          value={editContactEmail}
          onChangeText={onEditContactEmailChange}
          autoCapitalize="none"
          keyboardType="email-address"
          accessibilityLabel="Contact Email"
        />
        <Label>Phone (optional)</Label>
        <FieldInput value={editPhone} onChangeText={onEditPhoneChange} keyboardType="phone-pad" accessibilityLabel="Phone" />
        <Label>Address (optional)</Label>
        <FieldInput value={editAddress} onChangeText={onEditAddressChange} accessibilityLabel="Address" />
        <Label>Billing Type</Label>
        <ChipSelect options={BILLING_TYPE_OPTIONS} selectedId={editBillingType} onSelect={onEditBillingTypeChange} />
        <Label>
          {editBillingType === "FLAT_RATE"
            ? "Flat Rate per Invoice ($, optional)"
            : editBillingType === "PER_HOUR"
              ? "Billing Rate per Hour ($, optional)"
              : "Billing Rate per Job ($, optional)"}
        </Label>
        <FieldInput
          value={editBillingRate}
          onChangeText={onEditBillingRateChange}
          keyboardType="decimal-pad"
          accessibilityLabel="Billing Rate"
        />
        <ErrorText>{editError}</ErrorText>
        <Button title="Save Changes" onPress={() => onSaveEdit(item)} loading={editSaving} />
        <Button title="Cancel" variant="secondary" onPress={onCancelEdit} />
      </Card>
    );
  }

  return (
    <Card>
      <View style={styles.nameRow}>
        <Text style={styles.name}>{item.name}</Text>
        {item.code && <Badge text={item.code} />}
      </View>
      {item.contactEmail && <Text style={styles.meta}>{item.contactEmail}</Text>}
      {item.phone && <Text style={styles.meta}>{item.phone}</Text>}
      {item.address && <Text style={styles.meta}>{item.address}</Text>}
      <Text style={styles.meta}>
        Rate:{" "}
        {item.billingRate
          ? item.billingType === "FLAT_RATE"
            ? `$${item.billingRate.toFixed(2)} flat / invoice`
            : `$${item.billingRate.toFixed(2)} / ${BILLING_TYPE_LABEL[item.billingType ?? "PER_TRIP"]}`
          : "not set"}
      </Text>
      <View style={{ marginTop: spacing.sm }}>
        <Button title="Edit" variant="secondary" onPress={() => onStartEdit(item)} />
      </View>
    </Card>
  );
});

export function BusinessesScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [billingRate, setBillingRate] = useState("");
  const [billingType, setBillingType] = useState<BillingType>("PER_TRIP");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editCode, setEditCode] = useState("");
  const [editContactName, setEditContactName] = useState("");
  const [editContactEmail, setEditContactEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editBillingRate, setEditBillingRate] = useState("");
  const [editBillingType, setEditBillingType] = useState<BillingType>("PER_TRIP");
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
        code: code.trim() || undefined,
        contactName: contactName.trim() || undefined,
        contactEmail: contactEmail.trim() || undefined,
        phone: phone.trim() || undefined,
        address: address.trim() || undefined,
        billingRate: rate,
        billingType,
      });
      setName("");
      setCode("");
      setContactName("");
      setContactEmail("");
      setPhone("");
      setAddress("");
      setBillingRate("");
      setBillingType("PER_TRIP");
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not add business");
    } finally {
      setSaving(false);
    }
  }

  const startEdit = useCallback((business: Business) => {
    setEditingId(business.id);
    setEditName(business.name);
    setEditCode(business.code ?? "");
    setEditContactName(business.contactName ?? "");
    setEditContactEmail(business.contactEmail ?? "");
    setEditPhone(business.phone ?? "");
    setEditAddress(business.address ?? "");
    setEditBillingRate(business.billingRate ? String(business.billingRate) : "");
    setEditBillingType(business.billingType ?? "PER_TRIP");
    setEditError(null);
  }, []);

  const cancelEdit = useCallback(() => setEditingId(null), []);

  const saveEdit = useCallback(
    async (business: Business) => {
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
          code: editCode.trim() || undefined,
          contactName: editContactName.trim() || undefined,
          contactEmail: editContactEmail.trim() || undefined,
          phone: editPhone.trim() || undefined,
          address: editAddress.trim() || undefined,
          billingRate: rate,
          billingType: editBillingType,
        });
        setEditingId(null);
        await load();
      } catch (e) {
        setEditError(e instanceof ApiError ? e.message : "Could not save changes");
      } finally {
        setEditSaving(false);
      }
    },
    [
      editName,
      editCode,
      editContactName,
      editContactEmail,
      editPhone,
      editAddress,
      editBillingRate,
      editBillingType,
      load,
    ]
  );

  const renderItem = useCallback(
    ({ item }: { item: Business }) => {
      const isEditing = editingId === item.id;
      return (
        <BusinessRow
          item={item}
          isEditing={isEditing}
          editName={isEditing ? editName : ""}
          editCode={isEditing ? editCode : ""}
          editContactName={isEditing ? editContactName : ""}
          editContactEmail={isEditing ? editContactEmail : ""}
          editPhone={isEditing ? editPhone : ""}
          editAddress={isEditing ? editAddress : ""}
          editBillingRate={isEditing ? editBillingRate : ""}
          editBillingType={isEditing ? editBillingType : "PER_TRIP"}
          editError={isEditing ? editError : null}
          editSaving={isEditing ? editSaving : false}
          onEditNameChange={setEditName}
          onEditCodeChange={setEditCode}
          onEditContactNameChange={setEditContactName}
          onEditContactEmailChange={setEditContactEmail}
          onEditPhoneChange={setEditPhone}
          onEditAddressChange={setEditAddress}
          onEditBillingRateChange={setEditBillingRate}
          onEditBillingTypeChange={(v) => setEditBillingType(v as BillingType)}
          onStartEdit={startEdit}
          onCancelEdit={cancelEdit}
          onSaveEdit={saveEdit}
        />
      );
    },
    [
      editingId,
      editName,
      editCode,
      editContactName,
      editContactEmail,
      editPhone,
      editAddress,
      editBillingRate,
      editBillingType,
      editError,
      editSaving,
      startEdit,
      cancelEdit,
      saveEdit,
    ]
  );

  if (initialLoading) return <CenteredSpinner />;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
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
              <Label>Code (optional)</Label>
              <FieldInput value={code} onChangeText={setCode} autoCapitalize="characters" maxLength={30} placeholder="CAPBBQ1" />
              <Label>Contact Name (optional)</Label>
              <FieldInput value={contactName} onChangeText={setContactName} placeholder="Jane Doe" />
              <Label>Contact Email (optional)</Label>
              <FieldInput value={contactEmail} onChangeText={setContactEmail} autoCapitalize="none" keyboardType="email-address" placeholder="ap@business.ca" />
              <Label>Phone (optional)</Label>
              <FieldInput value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="613-555-0100" />
              <Label>Address (optional)</Label>
              <FieldInput value={address} onChangeText={setAddress} placeholder="100 Main St, Ottawa" />
              <Label>Billing Type</Label>
              <ChipSelect
                options={BILLING_TYPE_OPTIONS}
                selectedId={billingType}
                onSelect={(v) => setBillingType(v as BillingType)}
              />
              <Label>
                {billingType === "FLAT_RATE"
                  ? "Flat Rate per Invoice ($, optional)"
                  : billingType === "PER_HOUR"
                    ? "Billing Rate per Hour ($, optional)"
                    : "Billing Rate per Job ($, optional)"}
              </Label>
              <FieldInput value={billingRate} onChangeText={setBillingRate} keyboardType="decimal-pad" placeholder="45" />
              <ErrorText>{error}</ErrorText>
              <Button title="Add Business" onPress={addBusiness} loading={saving} />
            </Card>
            <SectionTitle>Businesses</SectionTitle>
          </View>
        }
        ListEmptyComponent={!error ? <Text style={styles.empty}>No businesses yet.</Text> : null}
        renderItem={renderItem}
      />
    </KeyboardAvoidingView>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    name: { color: colors.text, fontSize: 16, fontWeight: "700" },
    nameRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    meta: { color: colors.textMuted, marginTop: 2, fontSize: 13 },
    empty: { color: colors.textMuted, textAlign: "center", marginTop: spacing.lg },
  });
}
