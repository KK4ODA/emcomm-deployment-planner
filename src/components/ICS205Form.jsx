import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { HelpCircle, Plus, Trash2, FileDown } from "lucide-react";
import { toast } from "sonner";

const HelpIcon = ({ text }) => (
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger asChild>
        <HelpCircle className="h-4 w-4 text-slate-400 cursor-help" />
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <p className="text-sm">{text}</p>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
);

export default function ICS205Form({ open, onClose, onSubmit, form: existingForm, locationName }) {
  const [form, setForm] = useState({
    incident_name: '',
    operational_period_start: '',
    operational_period_end: '',
    radio_channels: [],
    special_instructions: '',
    prepared_by_name: '',
    prepared_by_position: '',
    preparation_date: ''
  });

  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (existingForm) {
      setForm({
        incident_name: existingForm.incident_name || '',
        operational_period_start: existingForm.operational_period_start || '',
        operational_period_end: existingForm.operational_period_end || '',
        radio_channels: existingForm.radio_channels || [],
        special_instructions: existingForm.special_instructions || '',
        prepared_by_name: existingForm.prepared_by_name || '',
        prepared_by_position: existingForm.prepared_by_position || '',
        preparation_date: existingForm.preparation_date || ''
      });
    } else {
      setForm({
        incident_name: '',
        operational_period_start: '',
        operational_period_end: '',
        radio_channels: [],
        special_instructions: '',
        prepared_by_name: '',
        prepared_by_position: '',
        preparation_date: new Date().toISOString().slice(0, 16)
      });
    }
  }, [existingForm, open]);

  const addChannel = () => {
    setForm({
      ...form,
      radio_channels: [
        ...form.radio_channels,
        {
          zone_group: '',
          channel_number: '',
          function: '',
          channel_name: '',
          assignment: '',
          rx_freq: '',
          rx_tone: '',
          tx_freq: '',
          tx_tone: '',
          mode: 'A',
          remarks: ''
        }
      ]
    });
  };

  const removeChannel = (index) => {
    const newChannels = form.radio_channels.filter((_, i) => i !== index);
    setForm({ ...form, radio_channels: newChannels });
  };

  const updateChannel = (index, field, value) => {
    const newChannels = [...form.radio_channels];
    newChannels[index] = { ...newChannels[index], [field]: value };
    setForm({ ...form, radio_channels: newChannels });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(form);
  };

  const handleExportPDF = async () => {
    if (!existingForm?.id) {
      toast.error('Please save the form before exporting');
      return;
    }

    try {
      setExporting(true);
      const { data } = await base44.functions.invoke('exportICS205', { formId: existingForm.id });
      const blob = new Blob([data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ICS205_${form.incident_name.replace(/[^a-z0-9]/gi, '_')}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
      toast.success('PDF exported successfully');
    } catch (error) {
      toast.error('Failed to export PDF');
      console.error(error);
    } finally {
      setExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between">
            <div>
              <DialogTitle>ICS 205 - Radio Communications Plan</DialogTitle>
              <p className="text-sm text-slate-500">{locationName}</p>
            </div>
            {existingForm && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleExportPDF}
                disabled={exporting}
                className="gap-2"
              >
                <FileDown className="h-4 w-4" />
                {exporting ? 'Exporting...' : 'Export PDF'}
              </Button>
            )}
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="incident_name">Incident Name *</Label>
                <HelpIcon text="Name or designation of the incident/event" />
              </div>
              <Input
                id="incident_name"
                value={form.incident_name}
                onChange={(e) => setForm({ ...form, incident_name: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="operational_period_start">Operational Period Start</Label>
                <HelpIcon text="Date and time when this operational period begins" />
              </div>
              <Input
                id="operational_period_start"
                type="datetime-local"
                value={form.operational_period_start}
                onChange={(e) => setForm({ ...form, operational_period_start: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="operational_period_end">Operational Period End</Label>
                <HelpIcon text="Date and time when this operational period ends" />
              </div>
              <Input
                id="operational_period_end"
                type="datetime-local"
                value={form.operational_period_end}
                onChange={(e) => setForm({ ...form, operational_period_end: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Label className="text-base font-semibold">Radio Channels</Label>
                <HelpIcon text="List all radio channels and frequencies to be used during this operational period" />
              </div>
              <Button type="button" onClick={addChannel} size="sm" variant="outline">
                <Plus className="h-4 w-4 mr-2" />
                Add Channel
              </Button>
            </div>

            {form.radio_channels.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-8 bg-slate-50 rounded-lg">
                No channels added yet. Click "Add Channel" to begin.
              </p>
            ) : (
              <div className="space-y-4">
                {form.radio_channels.map((channel, index) => (
                  <div key={index} className="p-4 border border-slate-200 rounded-lg space-y-3">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium text-sm">Channel {index + 1}</h4>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeChannel(index)}
                        className="text-rose-600 hover:text-rose-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1">
                          <Label className="text-xs">Zone/Group</Label>
                          <HelpIcon text="Radio zone or talkgroup designation" />
                        </div>
                        <Input
                          value={channel.zone_group}
                          onChange={(e) => updateChannel(index, 'zone_group', e.target.value)}
                          placeholder="e.g., Zone 1"
                          className="text-sm"
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center gap-1">
                          <Label className="text-xs">Channel #</Label>
                          <HelpIcon text="Channel number or trunked radio talkgroup number" />
                        </div>
                        <Input
                          value={channel.channel_number}
                          onChange={(e) => updateChannel(index, 'channel_number', e.target.value)}
                          placeholder="e.g., 1"
                          className="text-sm"
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center gap-1">
                          <Label className="text-xs">Function</Label>
                          <HelpIcon text="Purpose or tactical use of this channel (e.g., Command, Tactical, Support)" />
                        </div>
                        <Input
                          value={channel.function}
                          onChange={(e) => updateChannel(index, 'function', e.target.value)}
                          placeholder="e.g., Command"
                          className="text-sm"
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center gap-1">
                          <Label className="text-xs">Channel Name</Label>
                          <HelpIcon text="Common name or talkgroup name for this channel" />
                        </div>
                        <Input
                          value={channel.channel_name}
                          onChange={(e) => updateChannel(index, 'channel_name', e.target.value)}
                          placeholder="e.g., OPS 1"
                          className="text-sm"
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center gap-1">
                          <Label className="text-xs">Assignment</Label>
                          <HelpIcon text="Unit or group assigned to use this channel" />
                        </div>
                        <Input
                          value={channel.assignment}
                          onChange={(e) => updateChannel(index, 'assignment', e.target.value)}
                          placeholder="e.g., Team A"
                          className="text-sm"
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center gap-1">
                          <Label className="text-xs">RX Freq</Label>
                          <HelpIcon text="Receive frequency (N=Narrowband, W=Wideband)" />
                        </div>
                        <Input
                          value={channel.rx_freq}
                          onChange={(e) => updateChannel(index, 'rx_freq', e.target.value)}
                          placeholder="e.g., 146.520 N"
                          className="text-sm"
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center gap-1">
                          <Label className="text-xs">RX Tone/NAC</Label>
                          <HelpIcon text="Receive CTCSS/DCS tone or NAC code" />
                        </div>
                        <Input
                          value={channel.rx_tone}
                          onChange={(e) => updateChannel(index, 'rx_tone', e.target.value)}
                          placeholder="e.g., 100.0"
                          className="text-sm"
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center gap-1">
                          <Label className="text-xs">TX Freq</Label>
                          <HelpIcon text="Transmit frequency (N=Narrowband, W=Wideband)" />
                        </div>
                        <Input
                          value={channel.tx_freq}
                          onChange={(e) => updateChannel(index, 'tx_freq', e.target.value)}
                          placeholder="e.g., 146.520 N"
                          className="text-sm"
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center gap-1">
                          <Label className="text-xs">TX Tone/NAC</Label>
                          <HelpIcon text="Transmit CTCSS/DCS tone or NAC code" />
                        </div>
                        <Input
                          value={channel.tx_tone}
                          onChange={(e) => updateChannel(index, 'tx_tone', e.target.value)}
                          placeholder="e.g., 100.0"
                          className="text-sm"
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center gap-1">
                          <Label className="text-xs">Mode</Label>
                          <HelpIcon text="A=Analog, D=Digital, M=Mixed" />
                        </div>
                        <Select
                          value={channel.mode}
                          onValueChange={(value) => updateChannel(index, 'mode', value)}
                        >
                          <SelectTrigger className="text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="A">Analog</SelectItem>
                            <SelectItem value="D">Digital</SelectItem>
                            <SelectItem value="M">Mixed</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1 md:col-span-2">
                        <div className="flex items-center gap-1">
                          <Label className="text-xs">Remarks</Label>
                          <HelpIcon text="Any additional notes or special instructions for this channel" />
                        </div>
                        <Input
                          value={channel.remarks}
                          onChange={(e) => updateChannel(index, 'remarks', e.target.value)}
                          placeholder="Additional notes..."
                          className="text-sm"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="special_instructions">Special Instructions</Label>
              <HelpIcon text="Any special procedures, safety requirements, or additional communications information" />
            </div>
            <Textarea
              id="special_instructions"
              value={form.special_instructions}
              onChange={(e) => setForm({ ...form, special_instructions: e.target.value })}
              placeholder="Enter any special instructions for radio communications..."
              rows={4}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="prepared_by_name">Prepared By (Name)</Label>
                <HelpIcon text="Name of the person who prepared this form" />
              </div>
              <Input
                id="prepared_by_name"
                value={form.prepared_by_name}
                onChange={(e) => setForm({ ...form, prepared_by_name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="prepared_by_position">Position/Title</Label>
                <HelpIcon text="Position or title of the person who prepared this form" />
              </div>
              <Input
                id="prepared_by_position"
                value={form.prepared_by_position}
                onChange={(e) => setForm({ ...form, prepared_by_position: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="preparation_date">Date/Time</Label>
                <HelpIcon text="Date and time this form was prepared" />
              </div>
              <Input
                id="preparation_date"
                type="datetime-local"
                value={form.preparation_date}
                onChange={(e) => setForm({ ...form, preparation_date: e.target.value })}
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" className="bg-slate-900 hover:bg-slate-800">
              {existingForm ? 'Update' : 'Save'} ICS 205 Form
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}