import yaml
import json
import argparse
import sys
import os

def load_yaml(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        return yaml.safe_load(f)

def transform_shadowdark_template(template_data, entity_type):
    """
    Transform ShadowDark_Templates.yaml format to JSON Schema.
    """
    if 'templates' not in template_data or entity_type not in template_data['templates']:
        raise ValueError(f"Entity type '{entity_type}' not found in templates.")
    
    sd_template = template_data['templates'][entity_type]
    
    # Base JSON Schema
    schema = {
        "type": "object",
        "properties": {},
        "required": []
    }
    
    # 1. Required Fields (ID, Name, Type, Game, Source)
    if 'required_fields' in sd_template:
        for field, details in sd_template['required_fields'].items():
            schema['properties'][field] = {"type": "string", "description": details.get('description', '')}
            schema['required'].append(field)
            if 'value' in details:
                schema['properties'][field]['const'] = details['value']
    
    # 2. Properties (AC, HP, Stats, Flavor)
    if 'properties' in sd_template:
        for field, details in sd_template['properties'].items():
            prop_schema = {"description": details.get('description', '')}
            
            # Infer type
            if field == 'stats':
                prop_schema['type'] = "object"
                prop_schema['properties'] = {
                    "str": {"type": "string"}, "dex": {"type": "string"}, "con": {"type": "string"},
                    "int": {"type": "string"}, "wis": {"type": "string"}, "cha": {"type": "string"}
                }
                prop_schema['required'] = ["str", "dex", "con", "int", "wis", "cha"]
            else:
                prop_schema['type'] = "string" # Default to string for loose parsing
            
            schema['properties'][field] = prop_schema
            # Assuming core props are required for now
            if field not in ['flavor']: # Flavor might be optional
                schema['required'].append(field)

    # 3. Abilities (Array)
    if 'abilities' in sd_template:
        schema['properties']['abilities'] = {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "desc": {"type": "string"}
                },
                "required": ["name", "desc"]
            }
        }
        schema['required'].append('abilities')

    # 4. Actions (Array)
    if 'actions' in sd_template:
        schema['properties']['actions'] = {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "desc": {"type": "string"}
                },
                "required": ["name", "desc"]
            }
        }
        schema['required'].append('actions')

    return schema

def transform_solkesh_schema(schema_data, entity_type):
    """
    Transform SolKesh_ContentSchema.yaml format to JSON Schema.
    """
    if 'definitions' not in schema_data or entity_type not in schema_data['definitions']:
        raise ValueError(f"Entity type '{entity_type}' not found in definitions.")
    
    # SolKesh definitions are ALREADY valid JSON Schema (mostly)
    return schema_data['definitions'][entity_type]

def main():
    parser = argparse.ArgumentParser(description='Generate JSON Schema from Content Templates')
    parser.add_argument('--template', required=True, help='Path to YAML template file')
    parser.add_argument('--type', required=True, help='Entity type (e.g., Monster, Spell)')
    parser.add_argument('--format', choices=['shadowdark', 'solkesh'], required=True, help='Template format')
    args = parser.parse_args()

    try:
        data = load_yaml(args.template)
        
        if args.format == 'shadowdark':
            schema = transform_shadowdark_template(data, args.type)
        else:
            schema = transform_solkesh_schema(data, args.type)
            
        # Wrap in array for the Scribe (it expects a list of items)
        final_schema = {
            "type": "array",
            "items": schema
        }
        
        print(json.dumps(final_schema, indent=2))
        
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
